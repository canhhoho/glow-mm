import "server-only";
import { prisma } from "@/lib/db";
import { INFO_PAGES } from "@/lib/info-pages";
import { inSchedule } from "@/server/content/common";
import { STORE_VISIBLE } from "./store-queries";

export type SitemapPath = { path: string; lastModified?: Date };

/**
 * Đường dẫn công khai (chưa gắn locale) cho sitemap.xml: trang chủ, danh mục có SP đang bán (trực tiếp hoặc ở
 * danh mục con), SP đang bán, bộ sưu tập đang hiện, trang thông tin. Không gồm giỏ/checkout/đơn/tra cứu/tìm kiếm.
 */
export async function sitemapEntries(now: Date): Promise<SitemapPath[]> {
  const visible = { AND: STORE_VISIBLE };
  const [products, categories, collections] = await Promise.all([
    prisma.product.findMany({ where: visible, select: { slug: true, updatedAt: true }, orderBy: { slug: "asc" } }),
    prisma.category.findMany({
      where: { OR: [{ products: { some: visible } }, { children: { some: { products: { some: visible } } } }] },
      select: { slug: true },
      orderBy: { slug: "asc" },
    }),
    prisma.collection.findMany({
      where: { active: true, ...inSchedule(now) },
      select: { slug: true, updatedAt: true },
      orderBy: { slug: "asc" },
    }),
  ]);
  return [
    { path: "/" },
    ...categories.map((c) => ({ path: `/c/${c.slug}` })),
    ...products.map((p) => ({ path: `/p/${p.slug}`, lastModified: p.updatedAt })),
    ...collections.map((c) => ({ path: `/collection/${c.slug}`, lastModified: c.updatedAt })),
    ...INFO_PAGES.map((slug) => ({ path: `/info/${slug}` })),
  ];
}
