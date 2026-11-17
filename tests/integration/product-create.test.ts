import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createProduct } from "@/server/catalog/product-create";
import { loadReadiness } from "@/server/catalog/readiness";
import { productSteps } from "@/server/catalog/readiness-rules";
import { makeFixture, saleFixture } from "./fixtures";

const stepsOf = async (productId: string, published = false) => {
  const r = (await loadReadiness(prisma, [productId])).get(productId)!;
  return { r, flow: productSteps({ published, notReceivedSkus: r.notReceivedSkus }, r) };
};

describe("Bước 1: tạo sản phẩm tối giản (QT1a)", () => {
  it("5 ô → SP ẩn, giá 0, slug/SKU tự sinh, thương hiệu mới tạo luôn; bước hiện tại = nhập kho", async () => {
    const f = await makeFixture();
    const product = await createProduct(
      {
        nameEn: `Lip tint ${f.tag}`,
        brandName: `IT new brand ${f.tag}`,
        categoryId: f.categoryId,
        stockLocationId: f.mm.id,
        labels: ["Đỏ", "Hồng"],
        defaultLabel: "Tiêu chuẩn",
      },
      f.userId,
    );
    const saved = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      include: { variants: { orderBy: { sku: "asc" } }, translations: true, brand: true },
    });
    expect(saved.published).toBe(false);
    // 16/11/2026: kho bán chọn lúc nhập hàng — tạo SP không gán kho (kể cả khi gửi kèm).
    expect(saved.stockLocationId).toBeNull();
    expect(saved.slug).toBe(`lip-tint-${f.tag.toLowerCase()}`);
    expect(saved.brand.name).toBe(`IT new brand ${f.tag}`);
    expect(saved.variants.map((v) => [v.label, v.priceMmk])).toEqual([["Đỏ", 0], ["Hồng", 0]]);
    expect(saved.variants.every((v) => v.sku.startsWith(`LIP-TINT-${f.tag}`))).toBe(true);
    // Tên còn lại chép theo tên đã nhập (luôn có my + en).
    expect(saved.translations.map((t) => t.name).sort()).toEqual([`Lip tint ${f.tag}`, `Lip tint ${f.tag}`]);

    const { r, flow } = await stepsOf(product.id);
    expect(r.notReceivedSkus).toHaveLength(2);
    expect(flow.current).toBe("stock");
    expect(flow.steps.find((s) => s.key === "price")?.state).toBe("todo");
  });

  it("không nhập phân loại → một loại chuẩn; thiếu tên/thương hiệu bị từ chối", async () => {
    const f = await makeFixture();
    const p = await createProduct({ nameMy: `ဆပ်ပြာ ${f.tag}`, brandId: f.brandId, categoryId: f.categoryId, stockLocationId: f.mm.id, defaultLabel: "Tiêu chuẩn" }, f.userId);
    const variants = await prisma.variant.findMany({ where: { productId: p.id } });
    expect(variants.map((v) => v.label)).toEqual(["Tiêu chuẩn"]);
    await expect(createProduct({ brandId: f.brandId, categoryId: f.categoryId, defaultLabel: "x" }, f.userId)).rejects.toThrow();
    await expect(createProduct({ nameEn: "No brand", categoryId: f.categoryId, defaultLabel: "x" }, f.userId)).rejects.toThrow();
  });

  it("sao chép: chép nội dung, KHÔNG chép giá; SP nguồn đã nhập kho → bản sao vẫn chưa nhập", async () => {
    const f = await saleFixture([{ lot: "CRT", expiryInDays: 365, qty: 3 }]);
    await prisma.productTranslation.update({ where: { productId_locale: { productId: f.productId, locale: "en" } }, data: { description: "Source description" } });
    const copy = await createProduct(
      { nameEn: `Copy ${f.tag}`, brandId: f.brandId, categoryId: f.categoryId, stockLocationId: f.mm.id, defaultLabel: "Tiêu chuẩn", copyFromId: f.productId },
      f.userId,
    );
    const saved = await prisma.product.findUniqueOrThrow({ where: { id: copy.id }, include: { variants: true, translations: true } });
    expect(saved.variants[0].priceMmk).toBe(0);
    expect(saved.translations.find((t) => t.locale === "en")?.description).toBe("Source description");

    const source = await stepsOf(f.productId);
    expect(source.r.notReceivedSkus).toEqual([]);
    expect((await stepsOf(copy.id)).r.notReceivedSkus).toHaveLength(1);
  });

  it("tạo combo: lấy kho của thành phần; thành phần khác kho nhau bị chặn", async () => {
    const f = await makeFixture();
    const combo = await createProduct(
      { kind: "combo", nameEn: `Set ${f.tag}`, brandId: f.brandId, categoryId: f.categoryId, stockLocationId: f.mm.id, defaultLabel: "Tiêu chuẩn", components: [{ componentId: f.variantId, qty: 2 }] },
      f.userId,
    );
    const v = await prisma.variant.findFirstOrThrow({ where: { productId: combo.id }, include: { bundleItems: true } });
    expect(v.isBundle).toBe(true);
    expect(v.bundleItems.map((b) => [b.componentId, b.qty])).toEqual([[f.variantId, 2]]);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: combo.id } })).stockLocationId).toBe(f.mm.id);

    const other = await prisma.product.create({
      data: { slug: `it-other-${f.tag.toLowerCase()}`, brandId: f.brandId, categoryId: f.categoryId, stockLocationId: f.chi.id, variants: { create: { sku: `OTH-${f.tag}`, label: "x", priceMmk: 1 } } },
      include: { variants: true },
    });
    await expect(
      createProduct(
        { kind: "combo", nameEn: `Bad set ${f.tag}`, brandId: f.brandId, categoryId: f.categoryId, defaultLabel: "Tiêu chuẩn", components: [{ componentId: f.variantId, qty: 1 }, { componentId: other.variants[0].id, qty: 1 }] },
        f.userId,
      ),
    ).rejects.toThrow(/kho khác/);
  });
});
