import { describe, expect, it } from "vitest";
import { addDays, dayRange, yangonDayKey, yangonDayStart } from "@/lib/time";
import { itemProfit } from "@/server/reports/profit";

describe("Ngày theo giờ Yangon (UTC+06:30)", () => {
  it("ranh giới ngày", () => {
    expect(yangonDayKey(new Date("2026-10-15T17:29:59Z"))).toBe("2026-10-15");
    expect(yangonDayKey(new Date("2026-10-15T17:30:00Z"))).toBe("2026-10-16");
    expect(yangonDayStart("2026-10-16").toISOString()).toBe("2026-10-15T17:30:00.000Z");
    expect(() => yangonDayStart("2026-13-40")).toThrow();
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(dayRange("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });
});

describe("Lợi nhuận dòng đơn", () => {
  const simple = (returnedQty: number) =>
    itemProfit({
      qty: 3,
      returnedQty,
      unitPriceMmk: 10_000,
      parts: [{ variantId: "v", qty: 1 }],
      allocations: [
        { batchId: "A", variantId: "v", qty: 2, unitCostMmk: 4_000 },
        { batchId: "B", variantId: "v", qty: 1, unitCostMmk: 6_000 },
      ],
    });

  it("doanh thu − giá vốn lô đã xuất", () => {
    expect(simple(0)).toMatchObject({ netRevenue: 30_000, cogs: 14_000, profit: 16_000, missingCost: false });
  });

  it("hàng trả trừ đúng giá vốn lô theo thứ tự trả", () => {
    // Trả 2 → lấy 2 cái lô A (4,000) → giá vốn còn 6,000
    expect(simple(2)).toMatchObject({ netRevenue: 10_000, returnedRevenue: 20_000, cogs: 6_000, profit: 4_000 });
    expect(simple(3)).toMatchObject({ netRevenue: 0, cogs: 0, profit: 0 });
  });

  it("combo: trả theo bộ × thành phần; lô thiếu giá vốn được đánh dấu", () => {
    const r = itemProfit({
      qty: 2,
      returnedQty: 1,
      unitPriceMmk: 40_000,
      parts: [
        { variantId: "sun", qty: 1 },
        { variantId: "ton", qty: 2 },
      ],
      allocations: [
        { batchId: "S1", variantId: "sun", qty: 2, unitCostMmk: 10_000 },
        { batchId: "T1", variantId: "ton", qty: 4, unitCostMmk: 0 },
      ],
    });
    expect(r).toMatchObject({ netRevenue: 40_000, cogs: 10_000, profit: 30_000, missingCost: true });
  });
});
