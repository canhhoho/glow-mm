/** A missing cost stays distinguishable from a legitimate zero cost. */
export type CostStatus = "ACTUAL" | "ESTIMATED" | "MISSING";

export function inventoryCost(batch: { landedCostMmk: number | null; estimatedCostMmk?: number | null }): { unitCostMmk: number | null; costStatus: CostStatus } {
  if (batch.landedCostMmk != null) return { unitCostMmk: batch.landedCostMmk, costStatus: "ACTUAL" };
  if (batch.estimatedCostMmk != null) return { unitCostMmk: batch.estimatedCostMmk, costStatus: "ESTIMATED" };
  return { unitCostMmk: null, costStatus: "MISSING" };
}

/** Điều kiện Prisma của lô thiếu hoàn toàn giá vốn (`costStatus === "MISSING"`) — dùng chung bộ lọc Tồn kho và liên kết từ Tổng quan. */
export const MISSING_COST_BATCH = { landedCostMmk: null, estimatedCostMmk: null } as const;
