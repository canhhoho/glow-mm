import "server-only";
import type { Tx } from "@/server/inventory/ledger";
import { bundleDefs } from "@/server/orders/availability";

/**
 * Vốn VND của biến thể để tính giá (đã chốt P3): lô nhập gần nhất (`createdAt` mới nhất),
 * dùng `landedCostVnd` nếu đã phân bổ chi phí chuyến, chưa thì `unitCostVnd`.
 * Combo = tổng vốn thành phần × số lượng; thiếu vốn một thành phần → không tính được (null).
 */
export type VariantCost = { costVnd: number; landed: boolean } | null;

export async function variantCosts(tx: Tx, variantIds: string[]): Promise<Map<string, VariantCost>> {
  const defs = await bundleDefs(tx, variantIds);
  const baseIds = new Set(variantIds.filter((id) => !defs.has(id)));
  for (const def of defs.values()) for (const c of def) baseIds.add(c.componentId);

  const batches = await tx.batch.findMany({
    where: { variantId: { in: [...baseIds] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { variantId: true, unitCostVnd: true, landedCostVnd: true },
  });
  const base = new Map<string, VariantCost>();
  for (const b of batches) {
    if (base.has(b.variantId)) continue; // đã có lô mới nhất
    base.set(b.variantId, { costVnd: b.landedCostVnd ?? b.unitCostVnd, landed: b.landedCostVnd != null });
  }

  const result = new Map<string, VariantCost>();
  for (const id of variantIds) {
    const def = defs.get(id);
    if (!def) {
      result.set(id, base.get(id) ?? null);
      continue;
    }
    const parts = def.map((c) => ({ cost: base.get(c.componentId), qty: c.qty }));
    result.set(
      id,
      def.length > 0 && parts.every((p) => p.cost)
        ? {
            costVnd: parts.reduce((s, p) => s + p.cost!.costVnd * p.qty, 0),
            landed: parts.every((p) => p.cost!.landed),
          }
        : null,
    );
  }
  return result;
}
