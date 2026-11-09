import { describe, expect, it } from "vitest";
import { blockingErrors, evaluateReadiness, listStatus, productSteps, type ReadinessInput } from "@/server/catalog/readiness-rules";

const base = (over: Partial<ReadinessInput> = {}): ReadinessInput => ({
  location: { active: true, sellable: true, pricingMode: "VN_IMPORT" },
  imageCount: 3,
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
    // Một ảnh / ảnh chưa có alt / thiếu cách dùng không còn là lưu ý (form gọn, alt tự lấy tên SP).
    expect(evaluateReadiness(base({ imageCount: 1, content: [{ description: "d", usage: "" }] })).warnings).toEqual([]);
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

describe("productSteps (quy trình 5 bước)", () => {
  const states = (r: ReturnType<typeof productSteps>) => Object.fromEntries(r.steps.map((s) => [s.key, s.state]));

  it("SP mới tạo: giá 0, chưa nhập hàng, thiếu ảnh → bước hiện tại là Nhập kho", () => {
    const r = evaluateReadiness(base({ imageCount: 0, variants: [{ ...base().variants[0], priceMmk: 0, weightGrams: null }], available: new Map() }));
    const steps = productSteps({ published: false, notReceivedSkus: ["A"] }, r);
    expect(states(steps)).toEqual({ create: "warn", stock: "todo", price: "todo", review: "waiting", publish: "waiting" });
    expect(steps.current).toBe("stock");
  });

  it("đã nhập + có giá, chưa đăng → chờ đăng bán; cảnh báo giá vốn tạm không chặn", () => {
    const r = evaluateReadiness(base({ costEstimatedSkus: ["A"] }));
    const steps = productSteps({ published: false, notReceivedSkus: [] }, r);
    expect(states(steps)).toEqual({ create: "done", stock: "warn", price: "done", review: "done", publish: "todo" });
    expect(steps.current).toBe("publish");
    expect(steps.steps.find((s) => s.key === "stock")?.issues).toEqual([{ code: "COST_ESTIMATED", skus: ["A"] }]);
  });

  it("đang hiển thị, đủ dữ liệu → không còn bước cần làm", () => {
    const steps = productSteps({ published: true, notReceivedSkus: [] }, evaluateReadiness(base()));
    expect(steps.current).toBeNull();
    expect(states(steps).publish).toBe("done");
  });

  it("có giá nhưng chưa từng nhập kho (dữ liệu cũ) → bước 2 vẫn cần làm", () => {
    const steps = productSteps({ published: false, notReceivedSkus: ["A"] }, evaluateReadiness(base()));
    expect(states(steps).price).toBe("done");
    expect(steps.current).toBe("stock");
  });

  it("QT1b: giá cũ hơn phiếu nhập mới nhất → cảnh báo PRICE_STALE ở bước 3, không chặn mở bán", () => {
    const r = evaluateReadiness({ ...base(), staleSkus: ["A"] });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([{ code: "PRICE_STALE", skus: ["A"] }]);
    const steps = productSteps({ published: false, notReceivedSkus: [] }, r);
    expect(states(steps)).toMatchObject({ price: "warn", review: "done", publish: "todo" });
  });
});
