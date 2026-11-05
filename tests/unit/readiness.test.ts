import { describe, expect, it } from "vitest";
import { blockingErrors, evaluateReadiness, listStatus, type ReadinessInput } from "@/server/catalog/readiness-rules";

const base = (over: Partial<ReadinessInput> = {}): ReadinessInput => ({
  location: { active: true, sellable: true, pricingMode: "VN_IMPORT" },
  imageCount: 3,
  coverHasAlt: true,
  content: [
    { description: "d", usage: "u" },
    { description: "d", usage: "u" },
  ],
  variants: [{ id: "v1", sku: "A", active: true, priceMmk: 10_000, weightGrams: 100, isBundle: false, componentWeights: null }],
  available: new Map([["v1", 5]]),
  costMissingSkus: [],
  costEstimatedSkus: [],
  otherWarehouseSkus: [],
  ...over,
});
const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe("evaluateReadiness (D2)", () => {
  it("SP đủ dữ liệu → không lỗi, không cảnh báo", () => {
    expect(evaluateReadiness(base())).toEqual({ errors: [], warnings: [] });
  });

  it("lỗi chặn: không biến thể đang dùng, kho không bán, giá ≤ 0, thiếu khối lượng ở kho VN", () => {
    expect(codes(evaluateReadiness(base({ variants: [{ ...base().variants[0], active: false }] })).errors)).toEqual(["NO_ACTIVE_VARIANT"]);
    expect(codes(evaluateReadiness(base({ location: { active: false, sellable: true, pricingMode: "VN_IMPORT" } })).errors)).toEqual(["BAD_LOCATION"]);
    const r = evaluateReadiness(
      base({
        variants: [
          { id: "v1", sku: "A", active: true, priceMmk: 0, weightGrams: null, isBundle: false, componentWeights: null },
          { id: "v2", sku: "B", active: false, priceMmk: 0, weightGrams: null, isBundle: false, componentWeights: null }, // tắt → bỏ qua
        ],
      }),
    );
    expect(r.errors).toEqual([
      { code: "PRICE_ZERO", skus: ["A"] },
      { code: "NO_WEIGHT", skus: ["A"] },
    ]);
  });

  it("combo chưa khai báo khối lượng: đủ khối lượng thành phần thì không lỗi; kho MMK thiếu khối lượng chỉ cảnh báo", () => {
    const combo = { id: "c", sku: "SET", active: true, priceMmk: 1, weightGrams: null, isBundle: true, componentWeights: [50, 80] };
    expect(evaluateReadiness(base({ variants: [combo], available: new Map([["c", 1]]) })).errors).toEqual([]);
    const broken = { ...combo, componentWeights: [50, null] };
    expect(evaluateReadiness(base({ variants: [broken], available: new Map([["c", 1]]) })).errors).toEqual([{ code: "NO_WEIGHT", skus: ["SET"] }]);
    const local = evaluateReadiness(
      base({ location: { active: true, sellable: true, pricingMode: "LOCAL_MMK" }, variants: [{ ...base().variants[0], weightGrams: null }] }),
    );
    expect(local.errors).toEqual([]);
    expect(local.warnings).toEqual([{ code: "NO_WEIGHT_LOCAL", skus: ["A"] }]);
  });

  it("cảnh báo: ảnh, nội dung, giá vốn, hết hàng, tồn ở kho khác — không chặn", () => {
    const r = evaluateReadiness(
      base({
        imageCount: 0,
        content: [{ description: "", usage: "u" }],
        available: new Map([["v1", 0]]),
        costMissingSkus: ["A"],
        costEstimatedSkus: ["A"],
        otherWarehouseSkus: ["A"],
      }),
    );
    expect(r.errors).toEqual([]);
    expect(codes(r.warnings)).toEqual(["NO_IMAGE", "CONTENT_INCOMPLETE", "COST_MISSING", "COST_ESTIMATED", "OUT_OF_STOCK", "STOCK_OTHER_WAREHOUSE"]);
    expect(codes(evaluateReadiness(base({ imageCount: 1, coverHasAlt: false })).warnings)).toEqual(["FEW_IMAGES", "MISSING_ALT"]);
  });

  it("chặn khi lưu: SP mới bật → mọi lỗi; SP đang hiển thị → chỉ giá ≤ 0 / không biến thể", () => {
    const r = { errors: [{ code: "NO_WEIGHT" as const, skus: ["A"] }, { code: "PRICE_ZERO" as const, skus: ["A"] }], warnings: [] };
    expect(codes(blockingErrors(r, false))).toEqual(["NO_WEIGHT", "PRICE_ZERO"]);
    expect(codes(blockingErrors(r, true))).toEqual(["PRICE_ZERO"]);
    expect(listStatus({ archived: false, published: false }, r)).toBe("INCOMPLETE");
    expect(listStatus({ archived: false, published: false }, { errors: [], warnings: [] })).toBe("READY");
    expect(listStatus({ archived: false, published: true }, r)).toBe("PUBLISHED");
    expect(listStatus({ archived: true, published: false }, r)).toBe("ARCHIVED");
  });
});
