import { pickReturnBatches } from "@/server/orders/return-alloc";
import type { CostStatus } from "@/server/inventory/cost";

/**
 * Doanh thu / giá vốn của một dòng đơn, đã trừ hàng trả. Thuần.
 * Giá vốn = Σ (số lượng × giá vốn MMK) các lô đã xuất; phần trả lại lấy đúng các lô theo cùng thứ tự
 * như lúc nhập hàng trả (pickReturnBatches) nên khớp phiếu RETURN.
 */
export type ItemForProfit = {
  qty: number;
  returnedQty: number;
  unitPriceMmk: number;
  /** Thành phần mỗi đơn vị bán: biến thể thường = [{ variantId: chính nó, qty: 1 }]; combo = định nghĩa combo. */
  parts: { variantId: string; qty: number }[];
  /** Phân bổ lô (theo thứ tự id tăng dần) kèm biến thể của lô. */
  allocations: { batchId: string; variantId: string; qty: number; unitCostMmk: number; costStatus?: CostStatus }[];
};

export function itemProfit(item: ItemForProfit) {
  const grossRevenue = item.qty * item.unitPriceMmk;
  const returnedRevenue = item.returnedQty * item.unitPriceMmk;
  const cogs = item.allocations.reduce((s, a) => s + a.qty * a.unitCostMmk, 0);
  let returnedCost = 0;
  let missingCost = item.allocations.some((a) => a.costStatus ? a.costStatus === "MISSING" : a.unitCostMmk <= 0);
  const estimatedCost = item.allocations.some((a) => a.costStatus === "ESTIMATED");
  if (item.returnedQty > 0 && item.allocations.length > 0) {
    for (const part of item.parts) {
      const slices = item.allocations.filter((a) => a.variantId === part.variantId);
      const cost = new Map(slices.map((a) => [a.batchId, a.unitCostMmk]));
      const picks = pickReturnBatches(
        slices.map((a) => ({ batchId: a.batchId, qty: a.qty })),
        0,
        item.returnedQty * part.qty,
      );
      returnedCost += picks.reduce((s, p) => s + p.qty * (cost.get(p.batchId) ?? 0), 0);
    }
  }
  if (item.allocations.length === 0) missingCost = true;
  const netRevenue = grossRevenue - returnedRevenue;
  const netCogs = cogs - returnedCost;
  return { grossRevenue, returnedRevenue, netRevenue, cogs: netCogs, profit: netRevenue - netCogs, missingCost, estimatedCost };
}
