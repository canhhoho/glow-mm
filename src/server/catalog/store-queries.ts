import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { normalizeForSearch, searchVariants } from "@/lib/myanmar";
import type { CartLine } from "@/server/cart/cart";
import { salesBlockDays } from "@/server/inventory/documents";
import { sellableCutoff } from "@/server/inventory/fefo";
import { availableToSell } from "@/server/orders/availability";
import { pick } from "./queries";

/** Truy vấn cho storefront (chỉ sản phẩm đã đăng, biến thể đang bán). Tồn = khả dụng để bán (đã trừ giữ hàng). */

export type StoreSort = "new" | "price_asc" | "price_desc";
export type ProductListQuery = {
  locale: string;
  category?: string;
  q?: string;
  brand?: string;
  tags?: string[];
  sort?: StoreSort;
  /** Số sản phẩm tối đa (mặc định 60; dải sản phẩm trang chủ lấy ít hơn). */
  take?: number;
};

/** Ngưỡng hạn dùng đọc một lần mỗi request (trang chủ gọi `availability` cho nhiều dải SP cùng lúc). */
const storeBlockDays = cache(salesBlockDays);

/** Chỉ đọc → không cần transaction (giữ pool DB rảnh khi nhiều dải SP chạy song song). */
async function availability(variantIds: string[]) {
  const blockDays = await storeBlockDays();
  return availableToSell(prisma, variantIds, { now: new Date(), blockDays });
}

/** Điều kiện "SP hiển thị trên storefront" — dùng chung cho danh sách, bộ sưu tập, proxy 404. */
export const STORE_VISIBLE: Prisma.ProductWhereInput[] = [{ published: true }, { variants: { some: { active: true } } }];

const CARD_INCLUDE = {
  brand: true,
  translations: true,
  images: { orderBy: { sortOrder: "asc" }, take: 1, include: { file: { select: { url: true } } } },
  variants: { where: { active: true }, select: { id: true, priceMmk: true } },
} satisfies Prisma.ProductInclude;

type CardProduct = Prisma.ProductGetPayload<{ include: typeof CARD_INCLUDE }>;

/**
 * Thẻ SP **chưa có tồn** — phần nội dung (tên, giá, ảnh) cache được (`catalog/cached.ts`, P20). Tồn gắn sau mỗi
 * request bằng `withStock` (đổi theo đơn/phiếu kho và theo thời gian nên không cache).
 */
export type CardRow = {
  slug: string;
  name: string;
  brand: string;
  priceMmk: number;
  imageUrl: string | null;
  imageAlt: string | null;
  variantIds: string[];
};

function toCardRow(p: CardProduct, locale: string): CardRow {
  return {
    slug: p.slug,
    name: pick(p.translations, locale)?.name ?? p.slug,
    brand: p.brand.name,
    priceMmk: Math.min(...p.variants.map((v) => v.priceMmk)),
    imageUrl: p.images[0]?.file.url ?? null,
    imageAlt: p.images[0]?.alt ?? null,
    variantIds: p.variants.map((v) => v.id),
  };
}

/** Thẻ SP theo danh sách id, giữ đúng thứ tự cho sẵn (bộ sưu tập); bỏ SP chưa đăng / không còn biến thể bán. */
export async function loadCardRowsByIds(ids: string[], locale: string): Promise<CardRow[]> {
  if (ids.length === 0) return [];
  const products = await prisma.product.findMany({
    where: { AND: [...STORE_VISIBLE, { id: { in: ids } }] },
    include: CARD_INCLUDE,
  });
  const pos = new Map(ids.map((id, i) => [id, i]));
  products.sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
  return products.map((p) => toCardRow(p, locale));
}

/** Thẻ SP theo bộ lọc, mới nhất trước (sắp theo giá làm ở `sortCards` sau khi gắn tồn). */
export async function loadCardRows(query: Omit<ProductListQuery, "sort">): Promise<CardRow[]> {
  const and: Prisma.ProductWhereInput[] = [...STORE_VISIBLE];
  if (query.category) {
    and.push({ OR: [{ category: { slug: query.category } }, { category: { parent: { slug: query.category } } }] });
  }
  if (query.brand) and.push({ brand: { slug: query.brand } });
  for (const tag of query.tags ?? []) and.push({ tags: { some: { tag: { slug: tag } } } });
  const q = query.q?.trim();
  if (q) {
    and.push({
      OR: [
        ...searchVariants(q).map((v) => ({ translations: { some: { searchText: { contains: v } } } })),
        { brand: { name: { contains: q, mode: "insensitive" } } },
        // Tìm không dấu theo slug thương hiệu: "sen viet" → "sen-viet" (tên "Sen Việt" có dấu, SQL không bỏ dấu được).
        { brand: { slug: { contains: normalizeForSearch(q).replace(/ /g, "-") } } },
        { variants: { some: { sku: { contains: q.toUpperCase() } } } },
      ],
    });
  }

  const products = await prisma.product.findMany({
    where: { AND: and },
    orderBy: { createdAt: "desc" },
    take: Math.min(query.take ?? 60, 60),
    include: CARD_INCLUDE,
  });
  return products.map((p) => toCardRow(p, query.locale));
}

export type ProductCardData = Omit<CardRow, "variantIds"> & { inStock: boolean };

/** Gắn "còn hàng" cho nhiều nhóm thẻ bằng MỘT lần tính tồn (trang chủ có nhiều dải SP). */
export async function withStock(groups: CardRow[][]): Promise<ProductCardData[][]> {
  const ids = [...new Set(groups.flatMap((g) => g.flatMap((c) => c.variantIds)))];
  const avail = ids.length > 0 ? await availability(ids) : new Map<string, number>();
  return groups.map((g) =>
    g.map(({ variantIds, ...card }) => ({ ...card, inStock: variantIds.some((id) => (avail.get(id) ?? 0) > 0) })),
  );
}

export function sortCards(cards: ProductCardData[], sort: StoreSort | undefined) {
  if (sort === "price_asc") cards.sort((a, b) => a.priceMmk - b.priceMmk);
  if (sort === "price_desc") cards.sort((a, b) => b.priceMmk - a.priceMmk);
  return cards;
}

export async function listStoreProductsByIds(ids: string[], locale: string) {
  const [cards] = await withStock([await loadCardRowsByIds(ids, locale)]);
  return cards;
}

export async function listStoreProducts(query: ProductListQuery) {
  const [cards] = await withStock([await loadCardRows(query)]);
  return sortCards(cards, query.sort);
}

/** Bộ lọc: thương hiệu + loại da + vấn đề da có trên sản phẩm đang bán. */
export async function storeFilterOptions(locale: string) {
  const [brands, tags] = await Promise.all([
    prisma.brand.findMany({ where: { products: { some: { published: true } } }, orderBy: { name: "asc" } }),
    prisma.tag.findMany({
      where: { kind: { in: ["SKIN_TYPE", "CONCERN"] }, products: { some: { product: { published: true } } } },
      include: { translations: true },
      orderBy: { slug: "asc" },
    }),
  ]);
  return {
    brands: brands.map((b) => ({ slug: b.slug, name: b.name })),
    tags: tags.map((t) => ({ slug: t.slug, kind: t.kind, name: pick(t.translations, locale)?.name ?? t.slug })),
  };
}

export async function getStoreCategory(slug: string, locale: string) {
  const c = await prisma.category.findUnique({
    where: { slug },
    include: {
      translations: true,
      parent: { include: { translations: true } },
      children: { include: { translations: true }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!c) return null;
  return {
    slug: c.slug,
    name: pick(c.translations, locale)?.name ?? c.slug,
    parent: c.parent ? { slug: c.parent.slug, name: pick(c.parent.translations, locale)?.name ?? c.parent.slug } : null,
    children: c.children.map((ch) => ({ slug: ch.slug, name: pick(ch.translations, locale)?.name ?? ch.slug })),
  };
}

/** Phần nội dung trang SP (cache được, P20) — chưa có tồn/hạn dùng lô. */
export async function loadProductContent(slug: string, locale: string) {
  const p = await prisma.product.findFirst({
    where: { slug, published: true },
    include: {
      brand: true,
      translations: true,
      category: { include: { translations: true } },
      images: { orderBy: { sortOrder: "asc" }, include: { file: { select: { url: true } } } },
      tags: { include: { tag: { include: { translations: true } } } },
      variants: { where: { active: true }, orderBy: { priceMmk: "asc" } },
    },
  });
  if (!p || p.variants.length === 0) return null;
  const tr = pick(p.translations, locale);
  return {
    id: p.id,
    slug: p.slug,
    name: tr?.name ?? p.slug,
    description: tr?.description ?? null,
    usage: tr?.usage ?? null,
    ingredients: tr?.ingredientsText ?? null,
    storageNote: p.storageNote,
    brand: p.brand.name,
    category: { slug: p.category.slug, name: pick(p.category.translations, locale)?.name ?? p.category.slug },
    images: p.images.map((i) => ({ url: i.file.url, alt: i.alt })),
    tags: p.tags.map((t) => pick(t.tag.translations, locale)?.name ?? t.tag.slug),
    variants: p.variants.map((v) => ({ id: v.id, label: v.label, priceMmk: v.priceMmk, isBundle: v.isBundle })),
  };
}
export type ProductContent = NonNullable<Awaited<ReturnType<typeof loadProductContent>>>;

/** Gắn tồn khả dụng + hạn dùng lô sẽ xuất tiếp theo (FEFO) — luôn tính lúc request. */
export async function withProductStock(content: ProductContent, now = new Date()) {
  const ids = content.variants.map((v) => v.id);
  const blockDays = await storeBlockDays();
  const [avail, lots] = await Promise.all([
    availableToSell(prisma, ids, { now, blockDays }),
    // Chỉ lô còn bán được ở kho bán.
    prisma.stockBalance.findMany({
      where: {
        stockType: "SELLABLE",
        qty: { gt: 0 },
        location: { sellable: true },
        batch: { variantId: { in: ids }, expiryDate: { gte: sellableCutoff(now, blockDays) } },
      },
      select: { batch: { select: { variantId: true, expiryDate: true } } },
      orderBy: { batch: { expiryDate: "asc" } },
    }),
  ]);
  const nextExpiry = new Map<string, Date>();
  for (const l of lots) if (!nextExpiry.has(l.batch.variantId)) nextExpiry.set(l.batch.variantId, l.batch.expiryDate);
  return {
    ...content,
    variants: content.variants.map((v) => ({ ...v, available: avail.get(v.id) ?? 0, expiryDate: nextExpiry.get(v.id) ?? null })),
  };
}

export async function getStoreProduct(slug: string, locale: string, now = new Date()) {
  const content = await loadProductContent(slug, locale);
  return content ? withProductStock(content, now) : null;
}

/** Dòng giỏ hàng kèm giá/tên hiện hành; dòng không còn bán hoặc vượt tồn bị đánh dấu. */
export async function getCartDetails(lines: CartLine[], locale: string) {
  if (lines.length === 0) return { lines: [], subtotalMmk: 0, ok: false };
  const variants = await prisma.variant.findMany({
    where: { id: { in: lines.map((l) => l.variantId) } },
    include: { product: { include: { translations: true } } },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  const avail = await availability(variants.map((v) => v.id));
  const rows = lines.flatMap((l) => {
    const v = byId.get(l.variantId);
    if (!v) return [];
    const sellable = v.active && v.product.published;
    const available = sellable ? (avail.get(v.id) ?? 0) : 0;
    return [
      {
        variantId: v.id,
        slug: v.product.slug,
        name: pick(v.product.translations, locale)?.name ?? v.product.slug,
        label: v.label,
        priceMmk: v.priceMmk,
        qty: l.qty,
        available,
        ok: sellable && l.qty <= available,
      },
    ];
  });
  return {
    lines: rows,
    subtotalMmk: rows.reduce((s, r) => s + r.priceMmk * r.qty, 0),
    ok: rows.length > 0 && rows.every((r) => r.ok),
  };
}
