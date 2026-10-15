import "server-only";
import { prisma } from "@/lib/db";

/** Lấy bản dịch theo locale, fallback sang bản đầu tiên có sẵn. */
export function pick<T extends { locale: string }>(rows: T[], locale: string): T | undefined {
  return rows.find((r) => r.locale === locale) ?? rows[0];
}

/** Danh mục gốc (trang chủ, menu). */
export async function listRootCategories(locale: string) {
  const categories = await prisma.category.findMany({
    where: { parentId: null },
    orderBy: { sortOrder: "asc" },
    include: { translations: true },
  });
  return categories.map((c) => ({ slug: c.slug, name: pick(c.translations, locale)?.name ?? c.slug }));
}
