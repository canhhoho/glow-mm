"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/db";
import { can } from "@/server/auth/roles";
import { ForbiddenError, requirePermission } from "@/server/auth/session";
import type { ActionState } from "@/server/inventory/actions";
import { OrderError } from "./errors";
import { createOrder } from "./orders";
import { returnItems } from "./returns";
import { TRANSITIONS, type TransitionName } from "./state-machine";
import { transitionOrder } from "./transitions";
import { remitCod } from "./cod";

/** Server Action cho admin đơn hàng. Quyền luôn kiểm ở đây (requirePermission) và lần nữa trong domain. */

async function message(e: unknown): Promise<string> {
  if (e instanceof OrderError) {
    const t = await getTranslations("Orders");
    if (e.code === "out_of_stock") {
      const rows = (e.details?.variants as { variantId: string; requested: number; available: number }[]) ?? [];
      const ids = rows.map((r) => r.variantId).concat(e.details?.variantId ? [String(e.details.variantId)] : []);
      const skus = await prisma.variant.findMany({ where: { id: { in: ids } }, select: { id: true, sku: true } });
      const sku = new Map(skus.map((s) => [s.id, s.sku]));
      const list = rows.length
        ? rows.map((r) => `${sku.get(r.variantId) ?? r.variantId} (${r.available}/${r.requested})`).join(", ")
        : ids.map((id) => sku.get(id) ?? id).join(", ");
      return `${t("err.out_of_stock")}: ${list}`;
    }
    if (e.code === "price_missing" && e.details?.sku) return `${t("err.price_missing")}: ${String(e.details.sku)}`;
    return t(`err.${e.code}`);
  }
  if (e instanceof ZodError) return e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  if (e instanceof Error) return e.message;
  return String(e);
}

/** payload = JSON đơn (form nhiều dòng). Giá/phí ship tính lại ở server. */
export async function createOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let id: string;
  try {
    const user = await requirePermission("orders:create");
    const payload = JSON.parse(String(formData.get("payload") ?? "{}"));
    // CTV được gán khi tạo đơn (P10) — chỉ nhân viên có quyền gán.
    const affiliateId = field(formData, "affiliateId");
    if (affiliateId && !can(user.role, "orders:assign-affiliate")) throw new ForbiddenError("orders:assign-affiliate");
    id = (await createOrder(payload, { userId: user.id, affiliate: affiliateId ? { source: "STAFF", id: affiliateId } : undefined })).id;
  } catch (e) {
    return { error: await message(e) };
  }
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  redirect(`/admin/orders/${id}`);
}

const field = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
};

export async function remitCodAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("orders:reconcile-cod");
    const input = Object.fromEntries(formData);
    await remitCod(input, { userId: user.id, role: user.role });
    revalidatePath(`/admin/orders/${String(input.orderId)}`);
    revalidatePath("/admin/orders/cod");
    revalidatePath("/admin/orders");
    return { ok: "remitted" };
  } catch (e) { return { error: await message(e) }; }
}

export async function transitionOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id"));
  const name = String(formData.get("transition")) as TransitionName;
  try {
    if (!(name in TRANSITIONS)) return { error: "transition" };
    const user = await requirePermission(TRANSITIONS[name].permission);
    await transitionOrder(
      id,
      name,
      { userId: user.id, role: user.role },
      {
        note: field(formData, "note"),
        reason: field(formData, "reason"),
        carrier: field(formData, "carrier"),
        trackingNo: field(formData, "trackingNo"),
        fromLocationId: field(formData, "fromLocationId"),
      },
    );
  } catch (e) {
    return { error: await message(e) };
  }
  revalidatePath(`/admin/orders/${id}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  return { ok: name };
}

/** Form trả hàng: mỗi dòng đơn là ô `qty:<orderItemId>`. */
export async function returnItemsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const orderId = String(formData.get("orderId"));
  try {
    const user = await requirePermission("orders:return");
    const lines = [...formData.entries()]
      .filter(([k]) => k.startsWith("qty:"))
      .map(([k, v]) => ({ orderItemId: k.slice(4), qty: v }));
    await returnItems(
      orderId,
      {
        lines,
        reason: formData.get("reason"),
        toLocationId: field(formData, "toLocationId"),
        refunded: formData.get("refunded") === "on",
      },
      { userId: user.id, role: user.role },
    );
  } catch (e) {
    return { error: await message(e) };
  }
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  return { ok: "returned" };
}
