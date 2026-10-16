import "server-only";
import { prisma } from "@/lib/db";
import { buildCategoryTree } from "./category-tree";

/** Lấy bản dịch theo locale, fallback sang bản đầu tiên có sẵn. */
export function pick<T extends { locale: string }>(rows: T[], locale: string): T | undefined {
  return rows.find((r) => r.locale === locale) ?? rows[0];
}

/** Danh mục gốc có sản phẩm đang bán (trực tiếp hoặc ở danh mục con) — danh mục trống không hiện cho khách. */
export async function listRootCategories(locale: string) {
  const categories = await prisma.category.findMany({
    where: {
      parentId: null,
      OR: [
        { products: { some: { published: true } } },
        { children: { some: { products: { some: { published: true } } } } },
      ],
    },
    orderBy: { sortOrder: "asc" },
    include: { translations: true, icon: { select: { url: true } } },
  });
  return categories.map((c) => ({
    slug: c.slug,
    name: pick(c.translations, locale)?.name ?? c.slug,
    iconUrl: c.icon?.url ?? null,
  }));
}

/** Cây danh mục 2 cấp cho menu header (chỉ nhánh có SP đã đăng). */
export async function listCategoryTree(locale: string) {
  const categories = await prisma.category.findMany({
    include: { translations: true, _count: { select: { products: { where: { published: true } } } } },
  });
  return buildCategoryTree(
    categories.map((c) => ({
      id: c.id,
      slug: c.slug,
      parentId: c.parentId,
      sortOrder: c.sortOrder,
      name: pick(c.translations, locale)?.name ?? c.slug,
      published: c._count.products,
    })),
  );
}
