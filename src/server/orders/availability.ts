import "server-only";
import type { Tx } from "@/server/inventory/ledger";
import { bundleAvailability, type BundleDef } from "@/server/inventory/bundle";
import { sellableBatchWhere } from "@/server/inventory/fefo";

/**
 * Tồn khả dụng để bán theo biến thể:
 *   Σ tồn SELLABLE tại kho bán của SP (`Product.stockLocationId`), chỉ lô còn hạn ≥ ngưỡng (blockDays)
 *   − Σ giữ hàng ACTIVE chưa hết hạn.
 * Giữ hàng đã quá `expiresAt` coi như đã nhả ngay lúc đọc (không phụ thuộc cron).
 * Combo = số bộ tối đa ghép được từ khả dụng của thành phần.
 */
export type AvailabilityOpts = { now: Date; blockDays: number };

/** Khả dụng của biến thể thường (không phải combo). */
export async function baseAvailability(tx: Tx, variantIds: string[], opts: AvailabilityOpts) {
  const result = new Map<string, number>(variantIds.map((id) => [id, 0]));
  if (variantIds.length === 0) return result;

  const balances = await tx.stockBalance.findMany({
    where: {
      stockType: "SELLABLE",
      qty: { gt: 0 },
      location: { sellable: true },
      batch: { variantId: { in: variantIds }, ...sellableBatchWhere(opts.now, opts.blockDays) },
    },
    select: { qty: true, locationId: true, batch: { select: { variantId: true, variant: { select: { product: { select: { stockLocationId: true } } } } } } },
  });
  // P24: chỉ tồn ở đúng kho bán của SP mới bán được (hàng nằm nhầm kho phải chuyển về trước).
  for (const b of balances) {
    if (b.locationId !== b.batch.variant.product.stockLocationId) continue;
    result.set(b.batch.variantId, (result.get(b.batch.variantId) ?? 0) + b.qty);
  }

  const held = await tx.reservation.groupBy({
    by: ["variantId"],
    where: {
      variantId: { in: variantIds },
      status: "ACTIVE",
      OR: [{ expiresAt: null }, { expiresAt: { gt: opts.now } }],
    },
    _sum: { qty: true },
  });
  for (const h of held) result.set(h.variantId, (result.get(h.variantId) ?? 0) - (h._sum.qty ?? 0));

  return result;
}

/** Định nghĩa combo của các biến thể trong danh sách (biến thể thường không có trong map). */
export async function bundleDefs(tx: Tx, variantIds: string[]): Promise<Map<string, BundleDef>> {
  const rows = await tx.bundleItem.findMany({
    where: { bundleId: { in: variantIds } },
    select: { bundleId: true, componentId: true, qty: true },
  });
  const bundles = await tx.variant.findMany({ where: { id: { in: variantIds }, isBundle: true }, select: { id: true } });
  const defs = new Map<string, BundleDef>(bundles.map((b) => [b.id, []]));
  for (const r of rows) defs.get(r.bundleId)?.push({ componentId: r.componentId, qty: r.qty });
  return defs;
}

/** Khả dụng cho danh sách biến thể bất kỳ (thường hoặc combo). Âm được làm tròn về 0. */
export async function availableToSell(tx: Tx, variantIds: string[], opts: AvailabilityOpts) {
  const defs = await bundleDefs(tx, variantIds);
  const baseIds = new Set(variantIds.filter((id) => !defs.has(id)));
  for (const def of defs.values()) for (const c of def) baseIds.add(c.componentId);
  const base = await baseAvailability(tx, [...baseIds], opts);

  const result = new Map<string, number>();
  for (const id of variantIds) {
    const def = defs.get(id);
    result.set(id, Math.max(0, def ? bundleAvailability(def, base) : (base.get(id) ?? 0)));
  }
  return result;
}
