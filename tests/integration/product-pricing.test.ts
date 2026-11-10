import { reviewProducts, submitProducts } from "@/server/catalog/review";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { saveProduct } from "@/server/catalog/products";
import { saveProductPricing } from "@/server/catalog/product-pricing";
import { loadReadiness } from "@/server/catalog/readiness";
import { createDocument, postDocument } from "@/server/inventory/documents";
import { previewRun } from "@/server/pricing/runs";
import { makeFixture, type Fixture } from "./fixtures";

// QT1b — giá chỉ đặt ở bước 3, khối lượng nhập ở bước 2 (docs/ke-hoach-quy-trinh-san-pham.md).

const receive = async (f: Fixture, lot: string, extra: Record<string, unknown> = {}, line: Record<string, unknown> = {}) => {
  const doc = await createDocument(
    { type: "RECEIVE", toId: f.mm.id, lines: [{ variantId: f.variantId, lotNo: lot, expiryDate: "2029-12-31", unitCostVnd: 100_000, qty: 2, ...line }], ...extra },
    f.userId,
  );
  await postDocument(doc.id, f.userId);
  return doc;
};
const variant = (id: string) => prisma.variant.findUniqueOrThrow({ where: { id } });

describe("Bảng nhập tay giá bán", () => {
  it("giữ hoa hồng và chặn ghi đè giá đã đổi từ lúc mở bảng", async () => {
    const f = await makeFixture();
    await prisma.variant.update({ where: { id: f.variantId }, data: { affiliateCommissionMmk: 1_000 } });
    const input = { productId: f.productId, reason: "Bảng giá mới", variants: [{ id: f.variantId, priceMmk: 15_000, expectedPriceMmk: 10_000 }] };
    await saveProductPricing(input, f.userId);
    expect(await variant(f.variantId)).toMatchObject({ priceMmk: 15_000, affiliateCommissionMmk: 1_000 });
    await expect(saveProductPricing({ ...input, variants: [{ ...input.variants[0], priceMmk: 20_000 }] }, f.userId)).rejects.toThrow(/vừa được đổi/);
    expect((await variant(f.variantId)).priceMmk).toBe(15_000);
    expect(await prisma.priceHistory.count({ where: { variantId: f.variantId } })).toBe(1);
  });
});

describe("F4: bảng tính giá không bao giờ ra giá 0", () => {
  it("kho mua MMK: vốn 0 + lãi 0 → dòng bị bỏ qua PRICE_ZERO, biến thể khác vẫn tính", async () => {
    const f = await makeFixture();
    await prisma.product.update({ where: { id: f.productId }, data: { stockLocationId: f.chi.id, fixedProfitMmk: 0 } });
    const other = await prisma.variant.create({ data: { productId: f.productId, sku: `IT-${f.tag}-B`, label: "B", priceMmk: 1 } });
    const doc = await createDocument(
      {
        type: "RECEIVE",
        toId: f.chi.id,
        lines: [
          { variantId: f.variantId, lotNo: "Z", expiryDate: "2029-12-31", unitCostMmk: 0, qty: 1 },
          { variantId: other.id, lotNo: "Z", expiryDate: "2029-12-31", unitCostMmk: 5_000, qty: 1 },
        ],
      },
      f.userId,
    );
    await postDocument(doc.id, f.userId);
    await expect(previewRun({ locationId: f.chi.id, variantIds: [f.variantId] }, f.userId)).rejects.toThrow(/đủ dữ liệu/);
    const run = await previewRun({ locationId: f.chi.id, variantIds: [f.variantId, other.id] }, f.userId);
    expect(run.skipped).toEqual([{ variantId: f.variantId, sku: `IT-${f.tag}`, reason: "PRICE_ZERO" }]);
    expect((await prisma.priceRunLine.findMany({ where: { runId: run.id } })).map((l) => [l.variantId, l.newPriceMmk])).toEqual([[other.id, 5_000]]);
  });
});

describe("Bước 3: sửa giá tay trên trang SP", () => {
  it("đổi giá bắt buộc lý do → lịch sử 'manual: <lý do>'; giá 0 / hoa hồng > giá bị chặn; lãi cố định cập nhật", async () => {
    const f = await makeFixture();
    const v = { id: f.variantId, priceMmk: 15_000, affiliateCommissionMmk: "" };
    await expect(saveProductPricing({ productId: f.productId, variants: [v] }, f.userId)).rejects.toThrow(/lý do/);
    await expect(saveProductPricing({ productId: f.productId, reason: "x", variants: [{ ...v, priceMmk: 0 }] }, f.userId)).rejects.toThrow(/lớn hơn 0/);
    await expect(saveProductPricing({ productId: f.productId, reason: "x", variants: [{ ...v, affiliateCommissionMmk: 20_000 }] }, f.userId)).rejects.toThrow(/lớn hơn giá bán/);

    await saveProductPricing({ productId: f.productId, reason: "Theo giá đối thủ", fixedProfitMmk: "2500", variants: [{ ...v, affiliateCommissionMmk: "1000" }] }, f.userId);
    expect(await variant(f.variantId)).toMatchObject({ priceMmk: 15_000, affiliateCommissionMmk: 1_000 });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: f.productId } })).fixedProfitMmk).toBe(2_500);
    expect(await prisma.priceHistory.findMany({ where: { variantId: f.variantId }, select: { oldPriceMmk: true, newPriceMmk: true, reason: true } })).toEqual([
      { oldPriceMmk: 10_000, newPriceMmk: 15_000, reason: "manual: Theo giá đối thủ" },
    ]);
    expect(await prisma.auditLog.count({ where: { action: "product.pricing", entityId: f.productId } })).toBe(1);

    // Chỉ đổi hoa hồng: không cần lý do, không ghi lịch sử giá.
    await saveProductPricing({ productId: f.productId, variants: [{ ...v, affiliateCommissionMmk: "" }] }, f.userId);
    expect((await variant(f.variantId)).affiliateCommissionMmk).toBeNull();
    expect(await prisma.priceHistory.count({ where: { variantId: f.variantId } })).toBe(1);
    // Biến thể của SP khác bị chặn.
    const g = await makeFixture();
    await expect(saveProductPricing({ productId: f.productId, reason: "x", variants: [{ id: g.variantId, priceMmk: 1 }] }, f.userId)).rejects.toThrow(/không thuộc/);
  });

  it("form sửa (bước 1) không gửi giá: giữ giá đang có; loại mới thêm vào SP đang bán = giá 0, tạo ở trạng thái tắt", async () => {
    const f = await makeFixture();
    const slug = `it-${f.tag.toLowerCase()}`;
    await prisma.product.update({ where: { id: f.productId }, data: { slug, published: true, approvedAt: new Date() } });
    await prisma.variant.update({ where: { id: f.variantId }, data: { weightGrams: 100 } });
    const base = { id: f.productId, slug, brandId: f.brandId, categoryId: f.categoryId, published: true, my: { name: "x" }, en: { name: "x" } };
    await saveProduct({ ...base, variants: [{ id: f.variantId, sku: `IT-${f.tag}`, label: "50ml", weightGrams: 100 }, { sku: `IT-${f.tag}-NEW`, label: "100ml" }] }, f.userId);
    // P1-A: SP đã duyệt → thêm loại là thay đổi cần duyệt (bản đang sửa); khách chưa thấy loại mới.
    expect(await prisma.variant.count({ where: { productId: f.productId } })).toBe(1);
    expect(await submitProducts({ ids: [f.productId] }, f.userId)).toMatchObject([{ ok: true }]);
    const { approvalVersion } = await prisma.product.findUniqueOrThrow({ where: { id: f.productId } });
    expect(await reviewProducts({ decision: "approve", items: [{ id: f.productId, version: approvalVersion }] }, f.userId)).toMatchObject([{ ok: true }]);
    const variants = await prisma.variant.findMany({ where: { productId: f.productId }, orderBy: { sku: "asc" } });
    expect(variants.map((v) => [v.label, v.priceMmk, v.active])).toEqual([["50ml", 10_000, true], ["100ml", 0, false]]);
    expect(await prisma.priceHistory.count({ where: { variantId: f.variantId } })).toBe(0);
  });
});

describe("Bước 2: khối lượng trên phiếu nhập", () => {
  it("chỉ ghi khi biến thể chưa có khối lượng (audit variant.weight); SKU ngoài phiếu bị chặn", async () => {
    const f = await makeFixture();
    const doc = await receive(f, "W1", { weights: [{ variantId: f.variantId, weightGrams: "120" }] });
    expect((await variant(f.variantId)).weightGrams).toBe(120);
    expect(await prisma.auditLog.findFirst({ where: { action: "variant.weight", entityId: f.variantId } })).toMatchObject({ data: { weightGrams: 120, documentId: doc.id } });

    await receive(f, "W2", { weights: [{ variantId: f.variantId, weightGrams: 999 }] });
    expect((await variant(f.variantId)).weightGrams).toBe(120); // không ghi đè
    const g = await makeFixture();
    await expect(
      createDocument({ type: "RECEIVE", toId: f.mm.id, lines: [{ variantId: f.variantId, lotNo: "W3", expiryDate: "2029-12-31", unitCostVnd: 1, qty: 1 }], weights: [{ variantId: g.variantId, weightGrams: 5 }] }, f.userId),
    ).rejects.toThrow(/có trong phiếu/);
  });
});

describe("PRICE_STALE: nhập hàng sau lần đổi giá gần nhất", () => {
  it("chưa có lịch sử giá → không cảnh báo; đặt giá rồi nhập lô mới → cảnh báo ở bước 3; đặt lại giá → hết", async () => {
    const f = await makeFixture();
    const stale = async () => (await loadReadiness(prisma, [f.productId])).get(f.productId)!.warnings.find((w) => w.code === "PRICE_STALE");
    await receive(f, "S1");
    expect(await stale()).toBeUndefined();
    await saveProductPricing({ productId: f.productId, reason: "đặt giá", variants: [{ id: f.variantId, priceMmk: 20_000 }] }, f.userId);
    expect(await stale()).toBeUndefined();
    await receive(f, "S2", {}, { unitCostVnd: 130_000 });
    expect(await stale()).toEqual({ code: "PRICE_STALE", skus: [`IT-${f.tag}`] });
    await saveProductPricing({ productId: f.productId, reason: "giá vốn tăng", variants: [{ id: f.variantId, priceMmk: 24_000 }] }, f.userId);
    expect(await stale()).toBeUndefined();
  });
});
