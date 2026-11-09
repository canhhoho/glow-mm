import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { normalizeForSearch } from "@/lib/myanmar";
import { deleteBrand, updateBrand } from "@/server/catalog/brands";
import { listBrandsAdmin } from "@/server/catalog/brand-queries";
import { makeFixture, saleFixture } from "./fixtures";

describe("Brand management", () => {
  it("đếm SP quản lý/còn hàng bằng tồn khả dụng; ngừng kinh doanh không còn được đếm", async () => {
    const f = await saleFixture([{ lot: "BRAND", expiryInDays: 365, qty: 3 }]);
    const name = `IT ${f.tag}`;
    const row = async () => (await listBrandsAdmin(name)).find((b) => b.id === f.brandId);
    try {
      expect(await row()).toMatchObject({ totalProducts: 1, managedProducts: 1, inStockProducts: 1 });
      await prisma.variant.update({ where: { id: f.variantId }, data: { active: false } });
      expect(await row()).toMatchObject({ managedProducts: 1, inStockProducts: 0 });
      await prisma.variant.update({ where: { id: f.variantId }, data: { active: true } });
      await prisma.product.update({ where: { id: f.productId }, data: { archivedAt: new Date(), published: false } });
      expect(await row()).toMatchObject({ totalProducts: 1, managedProducts: 0, inStockProducts: 0 });
      await expect(deleteBrand(f.brandId)).rejects.toMatchObject({ code: "brandInUse" });
    } finally {
      await prisma.product.update({ where: { id: f.productId }, data: { published: false } });
    }
  });

  it("renames a brand without breaking its slug and refreshes product search text", async () => {
    const f = await makeFixture();
    const before = await prisma.brand.findUniqueOrThrow({ where: { id: f.brandId } });
    const name = `New Brand ${f.tag}`;
    await updateBrand(f.brandId, ` ${name} `);
    const after = await prisma.brand.findUniqueOrThrow({ where: { id: f.brandId } });
    expect(after).toMatchObject({ name, slug: before.slug });
    const tr = await prisma.productTranslation.findUniqueOrThrow({ where: { productId_locale: { productId: f.productId, locale: "en" } } });
    expect(tr.searchText).toBe(normalizeForSearch(`${tr.name} ${name} ${tr.ingredientsText ?? ""}`));
    await expect(updateBrand(f.brandId, " ")).rejects.toThrow();
    await expect(deleteBrand(f.brandId)).rejects.toMatchObject({ code: "brandInUse" });
    await prisma.product.update({ where: { id: f.productId }, data: { archivedAt: new Date() } });
    await expect(deleteBrand(f.brandId)).rejects.toMatchObject({ code: "brandInUse" });
    await expect(updateBrand("missing-brand", name)).rejects.toMatchObject({ code: "brandMissing" });
  });

  it("rejects duplicate names and deletes only unused brands", async () => {
    const tag = randomUUID();
    const a = await prisma.brand.create({ data: { name: `Alpha ${tag}`, slug: `alpha-${tag}` } });
    const b = await prisma.brand.create({ data: { name: `Beta ${tag}`, slug: `beta-${tag}` } });
    try {
      await expect(updateBrand(b.id, a.name.toUpperCase())).rejects.toMatchObject({ code: "brandDuplicate" });
      await deleteBrand(b.id);
      expect(await prisma.brand.findUnique({ where: { id: b.id } })).toBeNull();
      await expect(deleteBrand(b.id)).rejects.toMatchObject({ code: "brandMissing" });
    } finally {
      await prisma.brand.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    }
  });
});
