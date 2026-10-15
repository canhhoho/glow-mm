import "server-only";
import { prisma } from "@/lib/db";
import { productName } from "@/server/inventory/queries";

export async function listProductsAdmin(q?: string) {
  const query = q?.trim();
  const products = await prisma.product.findMany({
    where: query
      ? {
          OR: [
            { slug: { contains: query, mode: "insensitive" } },
            { translations: { some: { name: { contains: query, mode: "insensitive" } } } },
            { variants: { some: { sku: { contains: query, mode: "insensitive" } } } },
          ],
        }
      : undefined,
    orderBy: { updatedAt: "desc" },
    include: { brand: true, category: { include: { translations: true } }, translations: true, variants: true },
    take: 300,
  });
  return products.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: productName(p.translations, p.slug),
    brand: p.brand.name,
    category: productName(p.category.translations, p.category.slug),
    published: p.published,
    variants: p.variants.map((v) => ({ sku: v.sku, label: v.label, priceMmk: v.priceMmk, isBundle: v.isBundle })),
  }));
}

export async function productFormOptions() {
  const [brands, categories, tags, variants] = await Promise.all([
    prisma.brand.findMany({ orderBy: { name: "asc" } }),
    prisma.category.findMany({ include: { translations: true }, orderBy: { sortOrder: "asc" } }),
    prisma.tag.findMany({ include: { translations: true }, orderBy: [{ kind: "asc" }, { slug: "asc" }] }),
    prisma.variant.findMany({ where: { isBundle: false }, orderBy: { sku: "asc" }, select: { id: true, sku: true, label: true } }),
  ]);
  return {
    brands: brands.map((b) => ({ id: b.id, name: b.name })),
    categories: categories.map((c) => ({ id: c.id, name: productName(c.translations, c.slug) })),
    tags: tags.map((t) => ({ id: t.id, kind: t.kind, name: productName(t.translations, t.slug) })),
    components: variants.map((v) => ({ id: v.id, label: `${v.sku} (${v.label})` })),
  };
}

export async function getProductForEdit(id: string) {
  const p = await prisma.product.findUnique({
    where: { id },
    include: { translations: true, tags: true, variants: { include: { bundleItems: true }, orderBy: { sku: "asc" } } },
  });
  if (!p) return null;
  const tr = (locale: string) => p.translations.find((t) => t.locale === locale);
  return {
    id: p.id,
    slug: p.slug,
    brandId: p.brandId,
    categoryId: p.categoryId,
    published: p.published,
    storageNote: p.storageNote ?? "",
    ingredientsText: tr("en")?.ingredientsText ?? tr("my")?.ingredientsText ?? "",
    my: { name: tr("my")?.name ?? "", description: tr("my")?.description ?? "", usage: tr("my")?.usage ?? "" },
    en: { name: tr("en")?.name ?? "", description: tr("en")?.description ?? "", usage: tr("en")?.usage ?? "" },
    tagIds: p.tags.map((t) => t.tagId),
    variants: p.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      label: v.label,
      priceMmk: v.priceMmk,
      weightGrams: v.weightGrams,
      lowStockAt: v.lowStockAt,
      leadTimeDays: v.leadTimeDays,
      safetyStock: v.safetyStock,
      active: v.active,
      isBundle: v.isBundle,
      components: v.bundleItems.map((b) => ({ componentId: b.componentId, qty: b.qty })),
    })),
  };
}
export type ProductEditData = NonNullable<Awaited<ReturnType<typeof getProductForEdit>>>;
