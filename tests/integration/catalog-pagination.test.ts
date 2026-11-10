import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { loadCardPage } from "@/server/catalog/store-queries";
import { loadCollectionRow } from "@/server/content/collections";
import { makeFixture, unpublishTestProducts } from "./fixtures";

afterAll(unpublishTestProducts);
describe("D7 sắp toàn tập rồi phân trang", () => {
  it("hơn 60 SP, giá active nhỏ nhất, lọc trước count và không trùng/mất trang", async () => {
    const f = await makeFixture();
    const ids = Array.from({ length: 65 }, (_, i) => `it-page-${f.tag}-${i}`);
    await prisma.product.createMany({ data: ids.map((id, i) => ({ id, slug: id, brandId: f.brandId, categoryId: f.categoryId, stockLocationId: f.mm.id, published: true, approvedAt: new Date(), createdAt: new Date(2020, 0, i + 1) })) });
    await prisma.variant.createMany({ data: ids.map((productId, i) => ({ sku: `${productId}-A`, productId, label: "A", priceMmk: i + 100 })) });
    await prisma.variant.createMany({ data: [{ sku: `${ids[0]}-B`, productId: ids[0], label: "B", priceMmk: 1 }, { sku: `${ids[64]}-HIDDEN`, productId: ids[64], label: "Hidden", priceMmk: 0, active: false }] });
    // Slug fixture giữ chữ hoa trong tag.
    const b = await prisma.brand.findUniqueOrThrow({ where: { id: f.brandId } });
    const pages = await Promise.all([1, 2, 3].map((page) => loadCardPage({ locale: "en", brand: b.slug, sort: "price_asc", page })));
    expect(pages[0]).toMatchObject({ total: 65, page: 1, pages: 3 });
    expect(pages[0].rows[0]).toMatchObject({ slug: ids[0], priceMmk: 1 });
    const rows = pages.flatMap((p) => p.rows);
    expect(new Set(rows.map((p) => p.slug)).size).toBe(65);
    expect(rows.map((p) => p.priceMmk)).toEqual([...rows.map((p) => p.priceMmk)].sort((a,b)=>a-b));
    expect((await loadCardPage({ locale: "en", brand: b.slug, sort: "price_desc" })).rows[0].slug).toBe(ids[64]);
    expect((await loadCardPage({ locale: "en", brand: b.slug, page: 999 })).page).toBe(3);
    expect((await loadCardPage({ locale: "en", brand: b.slug, q: "' OR 1=1 --" })).total).toBe(0);
    expect((await loadCardPage({ locale: "en", brand: `missing-${f.tag}` })).total).toBe(0);
    const collection = await prisma.collection.create({ data: { slug: `it-pages-${f.tag}`, active: true, translations: { create: { locale: "en", name: "Pages" } }, items: { create: ids.map((productId, sortOrder) => ({ productId, sortOrder })) } } });
    const one = await loadCollectionRow(collection.slug, "en", 1);
    const three = await loadCollectionRow(collection.slug, "en", 3);
    expect(one).toMatchObject({ total: 65, pages: 3 });
    expect(one!.products).toHaveLength(24);
    expect(three!.products).toHaveLength(17);
  });
});
