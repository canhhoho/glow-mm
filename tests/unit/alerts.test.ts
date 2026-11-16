import { describe, expect, it } from "vitest";
import { classifyExpiry, daysLeft, lowStock, reorderList, reorderSuggestion, type VariantStock } from "@/server/alerts/compute";

const now = new Date("2026-10-15T10:00:00Z");
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const T = { blockDays: 90, warnDays: 180 };

const v = (over: Partial<VariantStock>): VariantStock => ({
  variantId: "v",
  sku: "SKU",
  name: "n",
  lowStockAt: 5,
  safetyStock: 0,
  leadTimeDays: 21,
  available: 10,
  otherQty: 0,
  soldUnits: 0,
  ...over,
});

describe("Hạn dùng", () => {
  it("phân loại theo số ngày còn lại", () => {
    expect(daysLeft(day("2026-10-15"), now)).toBe(0);
    expect(classifyExpiry(day("2026-10-14"), now, T)).toBe("expired");
    expect(classifyExpiry(day("2026-10-15"), now, T)).toBe("blocked");
    expect(classifyExpiry(day("2027-01-12"), now, T)).toBe("blocked"); // còn 89 ngày
    expect(classifyExpiry(day("2027-01-13"), now, T)).toBe("near"); // còn 90 ngày → bán được
    expect(classifyExpiry(day("2027-04-12"), now, T)).toBe("near"); // còn 179 ngày
    expect(classifyExpiry(day("2027-04-13"), now, T)).toBe(null); // còn 180 ngày
  });
});

describe("Tồn thấp", () => {
  it("khả dụng ≤ ngưỡng, sắp xếp ít nhất trước", () => {
    const list = [v({ sku: "A", available: 6 }), v({ sku: "B", available: 5 }), v({ sku: "C", available: 0 })];
    expect(lowStock(list).map((x) => x.sku)).toEqual(["C", "B"]);
  });
});

describe("Gợi ý đặt hàng", () => {
  const p = { salesWindowDays: 60, coverDays: 30 };

  it("nhu cầu = tốc độ × (lead time + cover) + an toàn − khả dụng; tồn ở vị trí khác chỉ để xem", () => {
    // 60 cái / 60 ngày = 1/ngày; nhu cầu 1 × (21 + 30) + 5 = 56; khả dụng 10 → đặt 46 (50 ở vị trí khác không tính)
    const r = reorderSuggestion(v({ soldUnits: 60, safetyStock: 5, available: 10, otherQty: 50 }), p);
    expect(r).toMatchObject({ dailySales: 1, need: 56, suggestQty: 46, coverDaysLeft: 10 });
    expect(reorderSuggestion(v({ soldUnits: 60, safetyStock: 5, available: 10, otherQty: 0 }), p).suggestQty).toBe(46);
  });

  it("không bán → chỉ bù tồn an toàn; đủ hàng → không đề xuất", () => {
    expect(reorderSuggestion(v({ soldUnits: 0, safetyStock: 3, available: 1 }), p)).toMatchObject({
      need: 3,
      suggestQty: 2,
      coverDaysLeft: null,
    });
    expect(reorderSuggestion(v({ soldUnits: 6, available: 100 }), p).suggestQty).toBe(0);
  });

  it("danh sách: bỏ dòng không cần đặt, sắp hết trước lên đầu", () => {
    const list = [
      v({ sku: "SLOW", soldUnits: 30, available: 10 }),
      v({ sku: "FAST", soldUnits: 120, available: 10 }),
      v({ sku: "OK", soldUnits: 1, available: 50 }),
    ];
    expect(reorderList(list, p).map((r) => r.sku)).toEqual(["FAST", "SLOW"]);
    expect(() => reorderSuggestion(v({}), { salesWindowDays: 0, coverDays: 1 })).toThrow();
  });
});
