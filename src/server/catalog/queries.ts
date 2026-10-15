import "server-only";
import { prisma } from "@/lib/db";

/** Lấy bản dịch theo locale, fallback sang bản đầu tiên có sẵn. */
function pick<T extends { locale: string }>(rows: T[], locale: string): T | undefined {
  return rows.find((r) => r.locale === locale) ?? rows[0];
}

export async function getHomeCatalog(locale: string) {
  const [categories, products] = await Promise.all([
    prisma.category.findMany({
      where: { parentId: null },
      orderBy: { sortOrder: "asc" },
      include: { translations: true },
    }),
    prisma.product.findMany({
      where: { published: true },
      take: 8,
      orderBy: { createdAt: "desc" },
      include: {
        brand: true,
        translations: true,
        variants: { where: { active: true }, orderBy: { priceMmk: "asc" }, take: 1 },
      },
    }),
  ]);

  return {
    categories: categories.map((c) => ({ slug: c.slug, name: pick(c.translations, locale)?.name ?? c.slug })),
    products: products.map((p) => ({
      slug: p.slug,
      brand: p.brand.name,
      name: pick(p.translations, locale)?.name ?? p.slug,
      priceMmk: p.variants[0]?.priceMmk ?? null,
    })),
  };
}
