import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { normalizeForSearch } from "@/lib/myanmar";
import { deleteBrand, updateBrand } from "@/server/catalog/brands";
import { makeFixture } from "./fixtures";

describe("Brand management", () => {
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
