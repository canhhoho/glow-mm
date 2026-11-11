import "server-only";
import { STORE_PRODUCT } from "@/server/catalog/store-visibility";
import { prisma } from "@/lib/db";
import { buildCategoryTree } from "./category-tree";

/**
 * Lấy bản dịch theo locale; thiếu thì English → Myanmar → bản đầu tiên. Nội dung SP/danh mục chưa có bản
 * tiếng Việt (P22 chỉ dịch giao diện) → trang /vi hiện English.
 */
export function pick<T extends { locale: string }>(rows: T[], locale: string): T | undefined {
  const by = (l: string) => rows.find((r) => r.locale === l);
  return by(locale) ?? by("en") ?? by("my") ?? rows[0];
}

/** Danh mục gốc có sản phẩm đang bán (trực tiếp hoặc ở danh mục con) — danh mục trống không hiện cho khách. */
export async function listRootCategories(locale: string) {
  const categories = await prisma.category.findMany({
    where: {
      parentId: null,
      OR: [
        { products: { some: STORE_PRODUCT } },
        { children: { some: { products: { some: STORE_PRODUCT } } } },
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
    include: { translations: true, _count: { select: { products: { where: STORE_PRODUCT } } } },
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
