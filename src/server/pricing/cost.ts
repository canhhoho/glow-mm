import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/server/inventory/ledger";
import { bundleDefs } from "@/server/orders/availability";

/**
 * Lô đã thực nhập: có dòng phiếu RECEIVE đã ghi sổ, số lượng dương. Lô được tạo ngay khi lập phiếu nháp
 * và không bị xoá khi huỷ phiếu → phiếu nháp/huỷ không được là nguồn giá mua.
 */
export const postedReceiveBatch = {
  documentLines: { some: { qty: { gt: 0 }, document: { type: "RECEIVE", status: "POSTED" } } },
} satisfies Prisma.BatchWhereInput;

/**
 * Vốn của biến thể để tính giá (đã chốt P3, mở rộng P24): lô **đã nhập ghi sổ** gần nhất (`createdAt` mới nhất) **có giá đúng loại tiền**.
 *  - VND: PURCHASE dùng `unitCostVnd` cho công thức có cước/kg; LANDED giữ cách tính cũ không cước.
 *  - MMK (kho mua tại Myanmar): `unitCostMmk`.
 * Combo = tổng vốn thành phần × số lượng; thiếu vốn một thành phần → không tính được (null).
 */
export type VariantCost = { costVnd: number; landed: boolean } | null;
export type CostCurrency = "VND" | "MMK";

export async function variantCosts(tx: Tx, variantIds: string[], currency: CostCurrency = "VND", basis: "PURCHASE" | "LANDED" = "LANDED"): Promise<Map<string, VariantCost>> {
  const defs = await bundleDefs(tx, variantIds);
  const baseIds = new Set(variantIds.filter((id) => !defs.has(id)));
  for (const def of defs.values()) for (const c of def) baseIds.add(c.componentId);

  const batches = await tx.batch.findMany({
    where: {
      variantId: { in: [...baseIds] },
      ...(currency === "VND" ? { unitCostVnd: { not: null } } : { unitCostMmk: { not: null } }),
      ...postedReceiveBatch,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { variantId: true, unitCostVnd: true, landedCostVnd: true, unitCostMmk: true },
  });
  const base = new Map<string, VariantCost>();
  for (const b of batches) {
    if (base.has(b.variantId)) continue; // đã có lô mới nhất
    base.set(
      b.variantId,
      currency === "VND"
        ? { costVnd: basis === "PURCHASE" ? b.unitCostVnd! : b.landedCostVnd ?? b.unitCostVnd!, landed: basis === "LANDED" && b.landedCostVnd != null }
        : { costVnd: b.unitCostMmk!, landed: true },
    );
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
