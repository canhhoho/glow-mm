import { convertVndToMmk, type RateValue } from "@/server/pricing/formula";

/**
 * P1-C (D11) — giá vốn một lô nhập nhiều lần = BÌNH QUÂN GIA QUYỀN THEO SỐ LƯỢNG ĐÃ NHẬP của các dòng phiếu NHẬP
 * đã ghi sổ (kể cả hàng đã bán / tester) — cùng mẫu số với phân bổ chuyến hàng (`shipments.ts`). Hàm thuần: tính lại
 * từ các dòng nên idempotent, không lệch dần theo thứ tự nhập / bán.
 */
export type ReceiptCostLine = {
  qty: number;
  unitCostVnd: number | null;
  unitCostMmk: number | null;
  /** Giá vốn về kho nhập tay (chỉ lô không thuộc chuyến). */
  landedCostVnd: number | null;
  rateId: string | null;
  rate: RateValue | null;
};

/** Bình quân gia quyền làm tròn nửa lên đến 1 đơn vị (số nguyên chính xác bằng BigInt). */
export function weightedAverage(items: { qty: number; value: number }[]): number | null {
  const total = items.reduce((s, i) => s + BigInt(i.qty), BigInt(0));
  if (items.length === 0 || total <= BigInt(0)) return null;
  const sum = items.reduce((s, i) => s + BigInt(i.qty) * BigInt(i.value), BigInt(0));
  return Number((sum * BigInt(2) + total) / (total * BigInt(2)));
}

export type LotCost = {
  unitCostVnd: number | null;
  unitCostMmk: number | null;
  /** Chỉ có khi MỌI dòng đều có giá vốn về kho (thiếu một dòng → chưa biết, để null). */
  landedCostVnd: number | null;
};

export function lotCost(lines: ReceiptCostLine[]): LotCost {
  const pos = lines.filter((l) => l.qty > 0);
  const avg = (pick: (l: ReceiptCostLine) => number | null) => weightedAverage(pos.flatMap((l) => (pick(l) == null ? [] : [{ qty: l.qty, value: pick(l)! }])));
  const withUnit = pos.filter((l) => l.unitCostVnd != null);
  const allLanded = withUnit.length > 0 && withUnit.every((l) => l.landedCostVnd != null);
  return {
    unitCostVnd: avg((l) => l.unitCostVnd),
    unitCostMmk: avg((l) => l.unitCostMmk),
    landedCostVnd: allLanded ? avg((l) => l.landedCostVnd) : null,
  };
}

/**
 * Đổi giá vốn VND của lô sang MMK. Các dòng cùng một tỷ giá (trường hợp thường gặp) → đổi một lần từ số đã bình quân
 * (giữ đúng kết quả cũ). Tỷ giá khác nhau giữa các lần nhập → đổi từng dòng theo tỷ giá của nó rồi bình quân theo SL.
 * `extraVnd`: phần chi phí cộng thêm mỗi đơn vị (phân bổ chuyến hàng) áp cho mọi dòng.
 */
export function lotCostMmk(lines: ReceiptCostLine[], averageVnd: number, fallbackRate: RateValue | null, extraVnd = 0): number | null {
  const pos = lines.filter((l) => l.qty > 0 && l.unitCostVnd != null);
  const rates = new Set(pos.map((l) => l.rateId ?? ""));
  if (rates.size <= 1 || pos.some((l) => !l.rate)) {
    const rate = pos.find((l) => l.rate)?.rate ?? fallbackRate;
    return rate ? convertVndToMmk(averageVnd, rate) : null;
  }
  return weightedAverage(pos.map((l) => ({ qty: l.qty, value: convertVndToMmk(Math.max(0, l.unitCostVnd! + extraVnd), l.rate!) })));
}
