"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/db";
import { can } from "@/server/auth/roles";
import { ForbiddenError, requirePermission } from "@/server/auth/session";
import type { ActionState } from "@/server/inventory/actions";
import { bulkTransition, BULK_TRANSITIONS, type BulkState } from "./bulk";
import { OrderError } from "./errors";
import { createOrder } from "./orders";
import { PickError, savePickManifests } from "./picking";
import { returnItems } from "./returns";
import { TRANSITIONS, type TransitionName } from "./state-machine";
import { transitionOrder } from "./transitions";
import { remitCod, settleCodException } from "./cod";
import { setShippingPayer } from "./shipping-payer";
import { updateTracking } from "./tracking";

/** Server Action cho admin đơn hàng. Quyền luôn kiểm ở đây (requirePermission) và lần nữa trong domain. */

export async function updateTrackingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const orderId = String(formData.get("orderId"));
  try {
    const user = await requirePermission("orders:ship");
    await updateTracking(Object.fromEntries(formData), { userId: user.id, role: user.role });
  } catch (e) { return { error: await message(e) }; }
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: "saved" };
}

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
    if (e.code === "cost_missing") {
      const lots = (e.details?.lots as { sku: string; lotNo: string }[]) ?? [];
      return `${t("err.cost_missing")}: ${lots.map((l) => `${l.sku} · ${l.lotNo}`).join(", ")}`;
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
    revalidatePath("/admin/reports");
    return { ok: "remitted" };
  } catch (e) { return { error: await message(e) }; }
}

export async function settleCodExceptionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("orders:reconcile-cod");
    const input = Object.fromEntries(formData);
    await settleCodException(input, { userId: user.id, role: user.role });
    revalidatePath(`/admin/orders/${String(input.orderId)}`);
    revalidatePath("/admin/orders/cod");
    revalidatePath("/admin/reports");
    revalidatePath("/admin");
    return { ok: "remitted" };
  } catch (e) { return { error: await message(e) }; }
}

export async function setShippingPayerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("orders:ship");
    const input = Object.fromEntries(formData);
    await setShippingPayer(input, { userId: user.id, role: user.role });
    revalidatePath(`/admin/orders/${String(input.orderId)}`);
    revalidatePath(`/admin/orders/${String(input.orderId)}/label`);
    revalidatePath("/admin/orders/export");
    return { ok: "saved" };
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
  revalidatePath("/admin/orders/preorders"); // QT3: đơn chuyển khỏi danh sách chờ hàng
  revalidatePath("/admin");
  // 16/11: bàn giao bằng lô giá vốn tạm → vẫn xong, báo rõ (lợi nhuận đơn là tạm tính).
  if (name === "ship") {
    const estimated = await prisma.orderAllocation.count({ where: { orderItem: { orderId: id }, costStatus: "ESTIMATED" } });
    if (estimated) return { ok: (await getTranslations("Orders"))("estimatedCostShipped", { count: estimated }) };
  }
  return { ok: name };
}

/** DT: xác nhận COD / bàn giao / hoàn tất nhiều đơn; `ids` lặp lại, mỗi đơn xử lý riêng (bulk.ts). */
export async function bulkTransitionAction(_prev: BulkState, formData: FormData): Promise<BulkState> {
  const transition = String(formData.get("transition"));
  try {
    if (!(BULK_TRANSITIONS as readonly string[]).includes(transition)) return { error: "transition" };
    const user = await requirePermission(TRANSITIONS[transition as TransitionName].permission);
    const results = await bulkTransition(
      { transition, ids: formData.getAll("ids").map(String), carrier: field(formData, "carrier") },
      { userId: user.id, role: user.role },
    );
    const failed = await Promise.all(
      results.flatMap((r) => (r.ok ? [] : [message(r.error).then((m) => ({ code: r.code, message: m }))])),
    );
    revalidatePath("/admin/orders");
    revalidatePath("/admin");
    // 16/11: đơn bàn giao bằng lô giá vốn tạm → báo kèm kết quả.
    let warning: string | undefined;
    if (transition === "ship") {
      const okIds = results.flatMap((r) => (r.ok ? [r.id] : []));
      const estimated = okIds.length ? await prisma.orderAllocation.findMany({ where: { orderItem: { orderId: { in: okIds } }, costStatus: "ESTIMATED" }, select: { orderItem: { select: { orderId: true } } } }) : [];
      const n = new Set(estimated.map((a) => a.orderItem.orderId)).size;
      if (n) warning = (await getTranslations("Orders"))("estimatedCostOrders", { count: n });
    }
    return { done: results.length - failed.length, total: results.length, failed, warning };
  } catch (e) {
    return { error: await message(e) };
  }
}

/** D3-lite: chốt lô của phiếu soạn đang xem (ids + hash) trước khi in. Trả số đơn đã chốt hoặc lỗi. */
export async function savePickManifestsAction(ids: string[], hash: string): Promise<{ saved?: number; error?: string }> {
  try {
    const user = await requirePermission("orders:view");
    const res = await savePickManifests({ ids, hash }, { userId: user.id, role: user.role });
    revalidatePath("/admin/orders");
    return { saved: res.saved };
  } catch (e) {
    if (e instanceof PickError) return { error: (await getTranslations("Orders"))(`bulk.pickErr.${e.code}`) };
    return { error: await message(e) };
  }
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
