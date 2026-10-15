import { describe, expect, it } from "vitest";
import { InsufficientStockError, isBatchUsable, pickFefo } from "@/server/inventory/fefo";
import { allocateLandedCost, vndToMmk } from "@/server/inventory/landed-cost";
import { bundleAvailability, expandBundles } from "@/server/inventory/bundle";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const today = d("2026-10-15");

describe("FEFO", () => {
  const batches = [
    { batchId: "late", expiryDate: d("2028-03-31"), available: 60 },
    { batchId: "early", expiryDate: d("2027-01-15"), available: 20 },
    { batchId: "blocked", expiryDate: d("2026-12-31"), available: 10 }, // còn 77 ngày < 90
    { batchId: "expired", expiryDate: d("2026-10-01"), available: 5 },
  ];

  it("xuất lô hết hạn sớm nhất trước", () => {
    expect(pickFefo(batches, 15, { today, blockDays: 90 })).toEqual([{ batchId: "early", qty: 15 }]);
  });

  it("tràn sang lô kế tiếp khi lô đầu không đủ", () => {
    expect(pickFefo(batches, 30, { today, blockDays: 90 })).toEqual([
      { batchId: "early", qty: 20 },
      { batchId: "late", qty: 10 },
    ]);
  });

  it("bỏ qua lô dưới ngưỡng hạn dùng và lô đã hết hạn", () => {
    expect(() => pickFefo(batches, 81, { today, blockDays: 90 })).toThrow(InsufficientStockError);
  });

  it("blockDays = 0 (xuất huỷ) vẫn dùng lô cận hạn nhưng không dùng lô đã hết hạn", () => {
    expect(pickFefo(batches, 12, { today, blockDays: 0 })).toEqual([
      { batchId: "blocked", qty: 10 },
      { batchId: "early", qty: 2 },
    ]);
  });

  it("cùng hạn → lô nhận trước xuất trước", () => {
    const same = [
      { batchId: "b2", expiryDate: d("2028-01-01"), receivedAt: d("2026-09-02"), available: 5 },
      { batchId: "b1", expiryDate: d("2028-01-01"), receivedAt: d("2026-09-01"), available: 5 },
    ];
    expect(pickFefo(same, 6, { today, blockDays: 90 })).toEqual([
      { batchId: "b1", qty: 5 },
      { batchId: "b2", qty: 1 },
    ]);
  });

  it("từ chối số lượng không hợp lệ", () => {
    expect(() => pickFefo(batches, 0, { today, blockDays: 90 })).toThrow();
    expect(() => pickFefo(batches, 1.5, { today, blockDays: 90 })).toThrow();
  });

  it("ngưỡng hạn dùng tính theo ngày", () => {
    expect(isBatchUsable(d("2027-01-13"), today, 90)).toBe(true); // đúng 90 ngày
    expect(isBatchUsable(d("2027-01-12"), today, 90)).toBe(false);
  });
});

describe("Landed cost", () => {
  const lines = [
    { key: "A", qty: 10, unitCostVnd: 100_000 }, // giá trị 1.000.000
    { key: "B", qty: 30, unitCostVnd: 50_000 }, // giá trị 1.500.000
  ];

  it("phân bổ theo giá trị mua", () => {
    const r = allocateLandedCost(lines, 500_000, "BY_VALUE");
    expect(r).toEqual([
      { key: "A", allocatedVnd: 200_000, landedUnitVnd: 120_000 },
      { key: "B", allocatedVnd: 300_000, landedUnitVnd: 60_000 },
    ]);
  });

  it("phân bổ theo số lượng", () => {
    const r = allocateLandedCost(lines, 400_000, "BY_QTY");
    expect(r.map((x) => x.allocatedVnd)).toEqual([100_000, 300_000]);
    expect(r.map((x) => x.landedUnitVnd)).toEqual([110_000, 60_000]);
  });

  it("tổng phân bổ luôn khớp đúng tổng chi phí (không mất do làm tròn)", () => {
    const three = [
      { key: "x", qty: 1, unitCostVnd: 1 },
      { key: "y", qty: 1, unitCostVnd: 1 },
      { key: "z", qty: 1, unitCostVnd: 1 },
    ];
    const r = allocateLandedCost(three, 100, "BY_VALUE");
    expect(r.reduce((s, x) => s + x.allocatedVnd, 0)).toBe(100);
  });

  it("hàng tặng (giá 0) → chia theo số lượng", () => {
    const r = allocateLandedCost([{ key: "g", qty: 4, unitCostVnd: 0 }], 4_000, "BY_VALUE");
    expect(r[0]).toEqual({ key: "g", allocatedVnd: 4_000, landedUnitVnd: 1_000 });
  });

  it("đổi VND → MMK theo tỷ giá lưu lúc nhập", () => {
    expect(vndToMmk(120_000, "0.170000")).toBe(20_400);
    expect(() => vndToMmk(1, 0)).toThrow();
  });
});

describe("Combo", () => {
  const bundles = new Map([["COMBO", [{ componentId: "SUN", qty: 1 }, { componentId: "TONER", qty: 2 }]]]);

  it("combo trừ kho từng thành phần, gộp với hàng lẻ", () => {
    const need = expandBundles(
      [
        { variantId: "COMBO", qty: 3 },
        { variantId: "SUN", qty: 1 },
      ],
      bundles,
    );
    expect(Object.fromEntries(need)).toEqual({ SUN: 4, TONER: 6 });
  });

  it("tồn khả dụng của combo = min(thành phần / định mức)", () => {
    const avail = new Map([
      ["SUN", 10],
      ["TONER", 7],
    ]);
    expect(bundleAvailability(bundles.get("COMBO")!, avail)).toBe(3);
  });

  it("không cho combo lồng combo", () => {
    const nested = new Map([
      ["C1", [{ componentId: "C2", qty: 1 }]],
      ["C2", [{ componentId: "SUN", qty: 1 }]],
    ]);
    expect(() => expandBundles([{ variantId: "C1", qty: 1 }], nested)).toThrow();
  });
});
