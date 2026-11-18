import { describe, expect, it } from "vitest";
import { FEATURES } from "@/lib/features";
import { blockingErrors, evaluateReadiness, publishBlockers, weightRequired, type ReadinessInput } from "@/server/catalog/readiness-rules";

// Giá tự động TẮT (cờ thật, 18/11/2026): thiếu khối lượng không chặn gửi duyệt / mở bán ở bất kỳ kho nào, chỉ cảnh báo
// NO_WEIGHT_LOCAL ("cần khi gửi VTP"). Quy tắc khi bật: tests/unit/readiness.test.ts (mock cờ bật).
const input = (pricingMode: "VN_IMPORT" | "LOCAL_MMK", weightGrams: number | null): ReadinessInput => ({
  location: { active: true, sellable: true, pricingMode },
  imageCount: 1,
  content: [{ description: "d", usage: "u" }],
  variants: [{ id: "v1", sku: "A", active: true, priceMmk: 10_000, weightGrams, isBundle: false, componentWeights: null }],
  available: new Map([["v1", 5]]),
  costMissingSkus: [],
  costEstimatedSkus: [],
  otherWarehouseSkus: [],
});

describe("khối lượng khi giá tự động tắt", () => {
  it("cờ đang tắt ở code thật", () => {
    expect(FEATURES.autoPricing).toBe(false);
    expect(weightRequired("VN_IMPORT")).toBe(false);
    expect(weightRequired(null)).toBe(false);
  });

  it.each(["VN_IMPORT", "LOCAL_MMK"] as const)("kho %s thiếu khối lượng → chỉ cảnh báo, không chặn", (mode) => {
    const r = evaluateReadiness(input(mode, null));
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([{ code: "NO_WEIGHT_LOCAL", skus: ["A"] }]);
    expect(blockingErrors(r, false)).toEqual([]);
    expect(publishBlockers(r, { approved: true })).toEqual([]);
  });

  it("đủ khối lượng → không cảnh báo", () => {
    expect(evaluateReadiness(input("VN_IMPORT", 120)).warnings).toEqual([]);
  });
});
