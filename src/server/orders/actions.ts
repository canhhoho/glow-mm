"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/server/auth/session";
import type { ActionState } from "@/server/inventory/actions";
import { OrderError } from "./errors";
import { createOrder } from "./orders";
import { reviewPaymentProof } from "./payments";
import { TRANSITIONS, type TransitionName } from "./state-machine";
import { transitionOrder } from "./transitions";

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
    id = (await createOrder(payload, { userId: user.id })).id;
  } catch (e) {
    return { error: await message(e) };
  }
  revalidatePath("/admin/orders");
  redirect(`/admin/orders/${id}`);
}

const field = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
};

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
  return { ok: name };
}

export async function reviewProofAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const orderId = String(formData.get("orderId"));
  try {
    const user = await requirePermission("orders:confirm-payment");
    await reviewPaymentProof(
      String(formData.get("proofId")),
      formData.get("decision") === "approve",
      { userId: user.id, role: user.role },
      field(formData, "note"),
    );
  } catch (e) {
    return { error: await message(e) };
  }
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  return { ok: "reviewed" };
}
