/**
 * Giá vốn nhập kho (landed cost) theo lô. Thuần, không phụ thuộc DB.
 * landed/đơn vị = giá mua/đơn vị + phần chi phí chuyến hàng (ship + thuế + phí) phân bổ cho lô / số lượng.
 * Tiền là số nguyên VND; phần dư do làm tròn được dồn để TỔNG phân bổ khớp đúng tổng chi phí.
 */

import { convertVndToMmk, type RateValue } from "@/server/pricing/formula";

export type AllocationMethod = "BY_VALUE" | "BY_QTY" | "BY_WEIGHT";

export type LandedLine = { key: string; qty: number; unitCostVnd: number; weightGrams?: number | null };

export type LandedResult = {
  key: string;
  /** Tổng chi phí chuyến hàng phân bổ cho dòng này (VND). */
  allocatedVnd: number;
  /** Giá vốn/đơn vị đã gồm chi phí (VND, làm tròn). */
  landedUnitVnd: number;
};

export function allocateLandedCost(lines: LandedLine[], totalCostsVnd: number, method: AllocationMethod): LandedResult[] {
  if (totalCostsVnd < 0 || !Number.isSafeInteger(totalCostsVnd)) throw new Error("Tổng chi phí phải là số nguyên ≥ 0");
  for (const l of lines) {
    if (!Number.isSafeInteger(l.qty) || l.qty <= 0) throw new Error(`Số lượng không hợp lệ ở dòng ${l.key}`);
    if (!Number.isSafeInteger(l.unitCostVnd) || l.unitCostVnd < 0) throw new Error(`Giá mua không hợp lệ ở dòng ${l.key}`);
    if (method === "BY_WEIGHT" && (!Number.isSafeInteger(l.weightGrams) || l.weightGrams! <= 0)) throw new Error(`Thiếu khối lượng ở dòng ${l.key}`);
  }
  if (lines.length === 0) return [];

  const weights = lines.map((l) => BigInt(l.qty) * BigInt(method === "BY_WEIGHT" ? l.weightGrams! : method === "BY_VALUE" ? l.unitCostVnd : 1));
  let weightSum = weights.reduce((a, b) => a + b, BigInt(0));
  // Tất cả giá mua = 0 (hàng tặng) → chia theo số lượng.
  const useQty = weightSum === BigInt(0);
  const w = useQty ? lines.map((l) => BigInt(l.qty)) : weights;
  if (useQty) weightSum = w.reduce((a, b) => a + b, BigInt(0));

  // Phân bổ theo phương pháp phần dư lớn nhất để tổng khớp tuyệt đối.
  const numerators = w.map((x) => BigInt(totalCostsVnd) * x);
  const floors = numerators.map(n => Number(n / weightSum));
  let rest = totalCostsVnd - floors.reduce((a, b) => a + b, 0);
  const order = numerators.map((n, i) => ({ i, remainder: n % weightSum })).sort((a, b) => a.remainder === b.remainder ? a.i - b.i : a.remainder > b.remainder ? -1 : 1);
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

/** Đổi VND → MMK theo tỷ giá (bản ghi `ExchangeRate`, hoặc số MMK cho 1 VND), làm tròn đến 1 MMK. */
export function vndToMmk(amountVnd: number, rate: RateValue | number | string): number {
  return convertVndToMmk(amountVnd, typeof rate === "object" ? rate : { mmkPerVnd: rate });
}
