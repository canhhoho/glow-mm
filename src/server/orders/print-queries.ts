import "server-only";
import { inventoryCost } from "@/server/inventory/cost";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rawId } from "@/lib/schemas";
import { salesBlockDays } from "@/server/inventory/documents";
import { productName } from "@/server/inventory/queries";
import { BULK_MAX } from "./bulk";
import { buildPickList, type PickRow } from "./pick-list";
import { orderNeeds, planHash, planPicks, type OrderPlan } from "./picking";

/** `?ids=a,b,c` của trang in hàng loạt → danh sách id hợp lệ (bỏ trùng, tối đa BULK_MAX). Sai → null. */
export function parsePrintIds(raw: string | string[] | undefined): string[] | null {
  const list = (Array.isArray(raw) ? raw.join(",") : (raw ?? "")).split(",").map((s) => s.trim()).filter(Boolean);
  const parsed = z.array(rawId).min(1).max(BULK_MAX).safeParse([...new Set(list)]);
  return parsed.success ? parsed.data : null;
}

/** Đơn để in nhãn, giữ đúng thứ tự đã chọn. */
export async function ordersForLabels(ids: string[]) {
  const orders = await prisma.order.findMany({
    where: { id: { in: ids } },
    include: { items: { select: { qty: true } }, deliveries: { orderBy: { createdAt: "desc" }, take: 1, select: { trackingNo: true } } },
  });
  const byId = new Map(orders.map((o) => [o.id, o]));
  return ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
}
export type LabelOrder = Awaited<ReturnType<typeof ordersForLabels>>[number];

/**
 * Phiếu lấy hàng gộp (D3-lite): kế hoạch FEFO cho các đơn đã xác nhận (chỉ đọc — chốt khi bấm in),
 * gộp theo kho bán → SKU → lô; kèm danh sách đóng gói theo đơn và `hash` để chốt đúng phiếu đang xem.
 */
export async function pickListFor(ids: string[], now = new Date()) {
  const orders = await prisma.order.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      code: true,
      status: true,
      recipientName: true,
      pick: { select: { printedAt: true, consumedAt: true } },
      items: { orderBy: { id: "asc" }, select: { id: true, variantId: true, sku: true, name: true, qty: true } },
    },
  });
  const byId = new Map(orders.map((o) => [o.id, o]));
  const ordered = ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  const plans = await planPicks(prisma, ordered.map((o) => o.id), { now, blockDays: await salesBlockDays() });
  const planOf = new Map(plans.map((p) => [p.orderId, p]));

  // Đơn chưa lập được kế hoạch: vẫn liệt kê hàng cần lấy (không có lô).
  const unplanned = new Map<string, Awaited<ReturnType<typeof orderNeeds>>>();
  for (const o of ordered) if (planOf.get(o.id)?.status !== "PLANNED") unplanned.set(o.id, await orderNeeds(prisma, o.id));
  const allNeeds = [...plans.flatMap((p) => p.picks), ...[...unplanned.values()].flat()];
  const [variants, batches, locations] = await Promise.all([
    prisma.variant.findMany({
      where: { id: { in: [...new Set(allNeeds.map((n) => n.variantId))] } },
      select: { id: true, sku: true, label: true, product: { select: { slug: true, translations: true } } },
    }),
    prisma.batch.findMany({
      where: { id: { in: [...new Set(plans.flatMap((p) => p.picks.map((x) => x.batchId)))] } },
      select: { id: true, lotNo: true, expiryDate: true },
    }),
    prisma.location.findMany({ where: { id: { in: [...new Set(allNeeds.map((n) => n.locationId))] } }, select: { id: true, name: true } }),
  ]);
  const variant = new Map(variants.map((v) => [v.id, v]));
  const batch = new Map(batches.map((b) => [b.id, b]));
  const location = new Map(locations.map((l) => [l.id, l]));
  const row = (code: string, n: { variantId: string; locationId: string; qty: number; batchId?: string }): PickRow => {
    const v = variant.get(n.variantId);
    const b = n.batchId ? batch.get(n.batchId) : undefined;
    return {
      orderCode: code,
      variantId: n.variantId,
      sku: v?.sku ?? n.variantId,
      name: v ? `${productName(v.product.translations, v.product.slug)} — ${v.label}` : "",
      location: location.get(n.locationId) ?? { id: n.locationId, name: n.locationId },
      qty: n.qty,
      lot: b && { batchId: b.id, lotNo: b.lotNo, expiryDate: b.expiryDate },
    };
  };
  const rows = ordered.flatMap((o) => {
    const p = planOf.get(o.id);
    return p?.status === "PLANNED" ? p.picks.map((x) => row(o.code, x)) : (unplanned.get(o.id) ?? []).map((n) => row(o.code, n));
  });
  return {
    orders: ordered.map((o) => ({ ...o, plan: (planOf.get(o.id)?.status ?? "NOT_CONFIRMED") as OrderPlan["status"] })),
    groups: buildPickList(rows),
    hash: planHash(plans),
    plannable: plans.some((p) => p.status === "PLANNED"),
  };
}

/**
 * 16/11: tình trạng giá vốn của các lô trên phiếu lấy hàng — lô THIẾU giá vốn sẽ không bàn giao được (chặn ở bước
 * bàn giao), lô giá vốn tạm vẫn bàn giao được. Hiện sẵn trên phiếu để kho xử lý trước.
 */
export async function lotCostStatuses(batchIds: string[]) {
  if (batchIds.length === 0) return new Map<string, "ACTUAL" | "ESTIMATED" | "MISSING">();
  const rows = await prisma.batch.findMany({ where: { id: { in: batchIds } }, select: { id: true, landedCostMmk: true, estimatedCostMmk: true } });
  return new Map(rows.map((b) => [b.id, inventoryCost(b).costStatus]));
}
