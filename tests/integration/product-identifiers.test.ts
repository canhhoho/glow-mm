import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { saveProduct } from "@/server/catalog/products";
import { makeFixture } from "./fixtures";

describe("automatic catalog identifiers", () => {
  it("allocates distinct codes when two new products are saved concurrently", async () => {
    const f = await makeFixture();
    const slug = `auto-${f.tag.toLowerCase()}`;
    const sku = `AUTO-${f.tag}-01`;
    const draft = {
      slug, autoSlug: true, brandId: f.brandId, categoryId: f.categoryId, stockLocationId: f.mm.id,
      my: { name: "Bag" }, en: { name: "Bag" },
      variants: [{ sku, autoSku: true, label: "Tiêu chuẩn", priceMmk: 1000 }],
    };
    const products = await Promise.all([saveProduct(draft, f.userId), saveProduct(draft, f.userId)]);
    expect(products.map(p => p.slug).sort()).toEqual([slug, `${slug}-2`].sort());
    const variants = await prisma.variant.findMany({ where: { productId: { in: products.map(p => p.id) } } });
    expect(variants.map(v => v.sku).sort()).toEqual([sku, `${sku}-2`].sort());
    expect(variants).toHaveLength(2);
  });

  it("keeps old codes on rename and allocates an added variant without overwriting the old one", async () => {
    const f = await makeFixture();
    const old = await prisma.product.findUniqueOrThrow({ where: { id: f.productId } });
    const variant = await prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } });
    const updated = await saveProduct({
      id: old.id, slug: old.slug, autoSlug: true,
      brandId: f.brandId, categoryId: f.categoryId, stockLocationId: f.mm.id,
      my: { name: "New name" }, en: { name: "New name" },
      variants: [
        { id: variant.id, sku: variant.sku, autoSku: true, label: variant.label, priceMmk: variant.priceMmk },
        { sku: variant.sku, autoSku: true, label: "New color", priceMmk: 2000 },
      ],
    }, f.userId);
    expect(updated.slug).toBe(old.slug);
    const after = await prisma.variant.findMany({ where: { productId: old.id } });
    expect(after).toHaveLength(2);
    expect(after.find(v => v.id === variant.id)?.sku).toBe(variant.sku);
    expect(after.find(v => v.id !== variant.id)?.sku).toBe(`${variant.sku}-2`);
  });
});
