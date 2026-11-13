import { describe, expect, it } from "vitest";
import { lotCost, lotCostMmk, weightedAverage, type ReceiptCostLine } from "@/server/inventory/lot-cost";

// P1-C (D11) — giá vốn lô = bình quân theo SL đã nhập.
const line = (qty: number, unitCostVnd: number | null, extra: Partial<ReceiptCostLine> = {}): ReceiptCostLine => ({
  qty,
  unitCostVnd,
  unitCostMmk: null,
  landedCostVnd: null,
  rateId: "r1",
  rate: { mmkPerVnd: "0.17" },
  ...extra,
});

describe("lotCost", () => {
  it("một dòng → giữ nguyên giá dòng", () => {
    expect(lotCost([line(10, 100_000)])).toEqual({ unitCostVnd: 100_000, unitCostMmk: null, landedCostVnd: null });
  });
  it("hai lần nhập khác giá → bình quân theo SL, làm tròn nửa lên", () => {
    expect(lotCost([line(10, 100_000), line(30, 120_000)]).unitCostVnd).toBe(115_000);
    expect(lotCost([line(1, 100), line(2, 101)]).unitCostVnd).toBe(101); // 100.67 → 101
    expect(lotCost([line(1, 100), line(1, 101)]).unitCostVnd).toBe(101); // 100.5 → 101 (nửa lên)
  });
  it("lô giá MMK bình quân riêng", () => {
    const m = (qty: number, mmk: number) => line(qty, null, { unitCostMmk: mmk, rateId: null, rate: null });
    expect(lotCost([m(5, 1000), m(5, 2000)])).toEqual({ unitCostVnd: null, unitCostMmk: 1500, landedCostVnd: null });
  });
  it("giá vốn về kho chỉ có khi MỌI dòng có", () => {
    expect(lotCost([line(10, 100, { landedCostVnd: 110 }), line(10, 120, { landedCostVnd: 140 })]).landedCostVnd).toBe(125);
    expect(lotCost([line(10, 100, { landedCostVnd: 110 }), line(10, 120)]).landedCostVnd).toBeNull();
  });
  it("bỏ dòng SL ≤ 0; không dòng nào → null", () => {
    expect(lotCost([line(0, 999), line(4, 100)]).unitCostVnd).toBe(100);
    expect(lotCost([]).unitCostVnd).toBeNull();
    expect(weightedAverage([])).toBeNull();
  });
  it("không tràn với số lớn", () => {
    expect(weightedAverage([{ qty: 2_000_000_000, value: 2_000_000_000 }, { qty: 2_000_000_000, value: 0 }])).toBe(1_000_000_000);
  });
});

describe("lotCostMmk", () => {
  const rate = { mmkPerVnd: "0.17" };
  it("cùng tỷ giá → đổi một lần từ số đã bình quân (kết quả như trước)", () => {
    expect(lotCostMmk([line(10, 100_000), line(10, 120_000)], 110_000, null)).toBe(18_700);
  });
  it("không có tỷ giá ở dòng → dùng tỷ giá dự phòng; không có gì → null", () => {
    const l = line(10, 100_000, { rateId: null, rate: null });
    expect(lotCostMmk([l], 100_000, rate)).toBe(17_000);
    expect(lotCostMmk([l], 100_000, null)).toBeNull();
  });
  it("hai tỷ giá khác nhau → đổi từng dòng theo tỷ giá của nó rồi bình quân theo SL", () => {
    const a = line(10, 100_000, { rateId: "r1", rate: { mmkPerVnd: "0.17" } }); // 17.000
    const b = line(30, 100_000, { rateId: "r2", rate: { mmkPerVnd: "0.18" } }); // 18.000
    expect(lotCostMmk([a, b], 100_000, null)).toBe(17_750);
    // Chi phí cộng thêm mỗi đơn vị (phân bổ chuyến) áp cho mọi dòng: (100.000 + 5.000) × tỷ giá
    expect(lotCostMmk([a, b], 100_000, null, 5_000)).toBe(18_638); // (10×17.850 + 30×18.900)/40 = 18.637,5 → 18.638
  });
});
