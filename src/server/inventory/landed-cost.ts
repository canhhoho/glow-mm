/**
 * Giá vốn nhập kho (landed cost) theo lô. Thuần, không phụ thuộc DB.
 * landed/đơn vị = giá mua/đơn vị + phần chi phí chuyến hàng (ship + thuế + phí) phân bổ cho lô / số lượng.
 * Tiền là số nguyên VND; phần dư do làm tròn được dồn để TỔNG phân bổ khớp đúng tổng chi phí.
 */

export type AllocationMethod = "BY_VALUE" | "BY_QTY";

export type LandedLine = { key: string; qty: number; unitCostVnd: number };

export type LandedResult = {
  key: string;
  /** Tổng chi phí chuyến hàng phân bổ cho dòng này (VND). */
  allocatedVnd: number;
  /** Giá vốn/đơn vị đã gồm chi phí (VND, làm tròn). */
  landedUnitVnd: number;
};

export function allocateLandedCost(lines: LandedLine[], totalCostsVnd: number, method: AllocationMethod): LandedResult[] {
  if (totalCostsVnd < 0 || !Number.isInteger(totalCostsVnd)) throw new Error("Tổng chi phí phải là số nguyên ≥ 0");
  for (const l of lines) {
    if (!Number.isInteger(l.qty) || l.qty <= 0) throw new Error(`Số lượng không hợp lệ ở dòng ${l.key}`);
    if (!Number.isInteger(l.unitCostVnd) || l.unitCostVnd < 0) throw new Error(`Giá mua không hợp lệ ở dòng ${l.key}`);
  }
  if (lines.length === 0) return [];

  const weights = lines.map((l) => (method === "BY_VALUE" ? l.qty * l.unitCostVnd : l.qty));
  let weightSum = weights.reduce((a, b) => a + b, 0);
  // Tất cả giá mua = 0 (hàng tặng) → chia theo số lượng.
  const useQty = weightSum === 0;
  const w = useQty ? lines.map((l) => l.qty) : weights;
  if (useQty) weightSum = w.reduce((a, b) => a + b, 0);

  // Phân bổ theo phương pháp phần dư lớn nhất để tổng khớp tuyệt đối.
  const raw = w.map((x) => (totalCostsVnd * x) / weightSum);
  const floors = raw.map(Math.floor);
  let rest = totalCostsVnd - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (rest <= 0) break;
    floors[i] += 1;
    rest -= 1;
  }

  return lines.map((l, i) => ({
    key: l.key,
    allocatedVnd: floors[i],
    landedUnitVnd: Math.round(l.unitCostVnd + floors[i] / l.qty),
  }));
}

/** Đổi VND → MMK theo tỷ giá (MMK cho 1 VND), làm tròn đến 1 MMK. */
export function vndToMmk(amountVnd: number, mmkPerVnd: number | string): number {
  const rate = typeof mmkPerVnd === "string" ? Number(mmkPerVnd) : mmkPerVnd;
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Tỷ giá không hợp lệ");
  return Math.round(amountVnd * rate);
}
