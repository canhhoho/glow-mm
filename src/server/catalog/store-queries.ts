import "server-only";
import { STORE_PRODUCT } from "@/server/catalog/store-visibility";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { FEATURES } from "@/lib/features";
import { Prisma } from "@/generated/prisma/client";
import { normalizeForSearch, searchVariants } from "@/lib/myanmar";
import type { CartLine } from "@/server/cart/cart";
import { salesBlockDays } from "@/server/inventory/documents";
import { nextLotForCustomer, sellableBatchWhere, type FefoCandidate } from "@/server/inventory/fefo";
import { availableToSell } from "@/server/orders/availability";
import { preorderCapacity } from "@/server/orders/preorder";
import { pick } from "./queries";
import { isStandardVariantLabel } from "@/lib/variant-label";

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
  page?: number;
};

/** Ngưỡng hạn dùng đọc một lần mỗi request (trang chủ gọi `availability` cho nhiều dải SP cùng lúc). */
const storeBlockDays = cache(salesBlockDays);

/** Chỉ đọc → không cần transaction (giữ pool DB rảnh khi nhiều dải SP chạy song song). */
async function availability(variantIds: string[]) {
  const blockDays = await storeBlockDays();
  return availableToSell(prisma, variantIds, { now: new Date(), blockDays });
}

/** Điều kiện "SP hiển thị trên storefront" — dùng chung cho danh sách, bộ sưu tập, proxy 404. */
export const STORE_VISIBLE: Prisma.ProductWhereInput[] = [STORE_PRODUCT, { variants: { some: { active: true } } }];

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

/** Lọc và sắp toàn tập ở DB trước phân trang; giá = MIN của biến thể đang dùng. */
export async function loadCardPage(query: ProductListQuery) {
  const and: Prisma.Sql[] = [Prisma.sql`p.published = TRUE`, Prisma.sql`EXISTS (SELECT 1 FROM "Variant" v WHERE v."productId" = p.id AND v.active = TRUE)`];
  if (query.category) {
    and.push(Prisma.sql`EXISTS (SELECT 1 FROM "Category" c LEFT JOIN "Category" parent ON parent.id = c."parentId" WHERE c.id = p."categoryId" AND (c.slug = ${query.category} OR parent.slug = ${query.category}))`);
  }
  if (query.brand) and.push(Prisma.sql`EXISTS (SELECT 1 FROM "Brand" b WHERE b.id = p."brandId" AND b.slug = ${query.brand})`);
  for (const tag of query.tags ?? []) and.push(Prisma.sql`EXISTS (SELECT 1 FROM "ProductTag" pt JOIN "Tag" t ON t.id = pt."tagId" WHERE pt."productId" = p.id AND t.slug = ${tag})`);
  const q = query.q?.trim();
  if (q) {
    const texts = searchVariants(q).map((v) => Prisma.sql`EXISTS (SELECT 1 FROM "ProductTranslation" t WHERE t."productId" = p.id AND strpos(t."searchText", ${v}) > 0)`);
    and.push(Prisma.sql`(${Prisma.join([...texts,
      Prisma.sql`EXISTS (SELECT 1 FROM "Brand" b WHERE b.id = p."brandId" AND (strpos(lower(b.name), lower(${q})) > 0 OR strpos(b.slug, ${normalizeForSearch(q).replace(/ /g, "-")}) > 0))`,
      Prisma.sql`EXISTS (SELECT 1 FROM "Variant" v WHERE v."productId" = p.id AND strpos(v.sku, ${q.toUpperCase()}) > 0)`,
    ], " OR ")})`);
  }
  const where = Prisma.join(and, " AND ");
  const take = Math.min(60, Math.max(1, Math.trunc(query.take ?? 24)));
  const requestedPage = Math.min(1000000, Math.max(1, Math.trunc(query.page ?? 1)));
  // Count và page dùng cùng snapshot để total/page không lệch khi có người đăng SP đồng thời.
  return prisma.$transaction(async (tx) => {
    const count = await tx.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS total FROM "Product" p WHERE ${where}`);
    const total = Number(count[0].total);
    const pages = Math.max(1, Math.ceil(total / take));
    const page = Math.min(requestedPage, pages);
    const order = query.sort === "price_asc" ? Prisma.sql`price ASC, p.id ASC` : query.sort === "price_desc" ? Prisma.sql`price DESC, p.id ASC` : Prisma.sql`p."createdAt" DESC, p.id ASC`;
    const ids = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT p.id, (SELECT MIN(v."priceMmk") FROM "Variant" v WHERE v."productId" = p.id AND v.active = TRUE) AS price FROM "Product" p WHERE ${where} ORDER BY ${order} LIMIT ${take} OFFSET ${(page - 1) * take}`);
    const products = await tx.product.findMany({ where: { id: { in: ids.map((r) => r.id) } }, include: CARD_INCLUDE });
    const byId = new Map(products.map((p) => [p.id, p]));
    return { rows: ids.map((r) => toCardRow(byId.get(r.id)!, query.locale)), total, page, pages };
  }, { isolationLevel: "RepeatableRead" });
}

export async function loadCardRows(query: ProductListQuery): Promise<CardRow[]> { return (await loadCardPage(query)).rows; }

/** `preorder` (QT3): hết hàng nhưng còn biến thể nhận đặt trước. */
export type ProductCardData = Omit<CardRow, "variantIds"> & { inStock: boolean; preorder: boolean };

/** Gắn "còn hàng" / "đặt trước" cho nhiều nhóm thẻ bằng MỘT lần tính tồn (trang chủ có nhiều dải SP). */
export async function withStock(groups: CardRow[][]): Promise<ProductCardData[][]> {
  const ids = [...new Set(groups.flatMap((g) => g.flatMap((c) => c.variantIds)))];
  const avail = ids.length > 0 ? await availability(ids) : new Map<string, number>();
  // Hạn mức đặt trước chỉ cần cho thẻ đã hết hàng.
  const outIds = groups.flatMap((g) => g.filter((c) => !c.variantIds.some((id) => (avail.get(id) ?? 0) > 0)).flatMap((c) => c.variantIds));
  const capacity = outIds.length > 0 ? await preorderCapacity(prisma, outIds) : new Map<string, number>();
  return groups.map((g) =>
    g.map(({ variantIds, ...card }) => {
      const inStock = variantIds.some((id) => (avail.get(id) ?? 0) > 0);
      return { ...card, inStock, preorder: !inStock && variantIds.some((id) => (capacity.get(id) ?? 0) > 0) };
    }),
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
  return cards;
}

/** Bộ lọc: thương hiệu + loại da + vấn đề da có trên sản phẩm đang bán. */
export async function storeFilterOptions(locale: string) {
  const [brands, tags] = await Promise.all([
    prisma.brand.findMany({ where: { products: { some: STORE_PRODUCT } }, orderBy: { name: "asc" } }),
    prisma.tag.findMany({
      where: { kind: { in: ["SKIN_TYPE", "CONCERN"] }, products: { some: { product: STORE_PRODUCT } } },
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
    where: { slug, ...STORE_PRODUCT },
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
    paoMonths: p.paoMonths,
    brand: p.brand.name,
    category: { slug: p.category.slug, name: pick(p.category.translations, locale)?.name ?? p.category.slug },
    images: p.images.map((i) => ({ url: i.file.url, alt: i.alt })),
    tags: p.tags.map((t) => pick(t.tag.translations, locale)?.name ?? t.tag.slug),
    // `standard`: nhãn hệ thống "Tiêu chuẩn" (lưu theo ngôn ngữ admin) — trang khách dịch hoặc ẩn, không hiện nguyên văn.
    variants: p.variants.map((v) => ({ id: v.id, label: v.label, standard: isStandardVariantLabel(v.label), priceMmk: v.priceMmk, isBundle: v.isBundle })),
  };
}
export type ProductContent = NonNullable<Awaited<ReturnType<typeof loadProductContent>>>;

/** Gắn tồn khả dụng + hạn dùng lô sẽ xuất tiếp theo (FEFO) — luôn tính lúc request. */
/** Hạn dùng hiển thị theo lô khách sẽ nhận: có ngày, không áp dụng hạn, hoặc không có (hết hàng / combo). */
export type StoreExpiry = { kind: "DATED"; date: Date } | { kind: "NONE" } | null;

export async function withProductStock(content: ProductContent, now = new Date()) {
  const ids = content.variants.map((v) => v.id);
  const blockDays = await storeBlockDays();
  const [avail, capacity, lots, held] = await Promise.all([
    availableToSell(prisma, ids, { now, blockDays }),
    preorderCapacity(prisma, ids),
    // D9: cùng điều kiện lô bán được với khả dụng (`sellableBatchWhere`, gồm lô không hạn), ở kho bán của SP (P24).
    prisma.stockBalance.findMany({
      where: {
        stockType: "SELLABLE",
        qty: { gt: 0 },
        location: { sellable: true, products: { some: { variants: { some: { id: { in: ids } } } } } },
        batch: { variantId: { in: ids }, ...sellableBatchWhere(now, blockDays) },
      },
      select: { qty: true, batch: { select: { id: true, variantId: true, expiryDate: true, expiryStatus: true, createdAt: true } } },
    }),
    prisma.reservation.groupBy({
      by: ["variantId"],
      where: { variantId: { in: ids }, status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      _sum: { qty: true },
    }),
  ]);
  const reserved = new Map(held.map((h) => [h.variantId, h._sum.qty ?? 0]));
  const byVariant = new Map<string, FefoCandidate[]>();
  for (const l of lots) {
    const list = byVariant.get(l.batch.variantId) ?? [];
    const same = list.find((c) => c.batchId === l.batch.id);
    if (same) same.available += l.qty;
    else list.push({ batchId: l.batch.id, available: l.qty, expiryDate: l.batch.expiryDate, expiryStatus: l.batch.expiryStatus, receivedAt: l.batch.createdAt });
    byVariant.set(l.batch.variantId, list);
  }
  // Lô của cái tiếp theo khách đặt — bỏ qua phần đã giữ cho đơn khác (D9).
  const expiryOf = (variantId: string): StoreExpiry => {
    if (!FEATURES.expiry) return null;
    const next = nextLotForCustomer(byVariant.get(variantId) ?? [], reserved.get(variantId) ?? 0, { today: now, blockDays });
    if (!next) return null;
    return next.expiryStatus === "NONE" ? { kind: "NONE" } : next.expiryDate ? { kind: "DATED", date: next.expiryDate } : null;
  };
  return {
    ...content,
    // `preorder` (QT3): số cái còn nhận đặt trước — chỉ ý nghĩa khi hết hàng (`available` ≤ 0).
    variants: content.variants.map((v) => {
      const expiry = expiryOf(v.id);
      return {
        ...v,
        available: avail.get(v.id) ?? 0,
        preorder: (avail.get(v.id) ?? 0) > 0 ? 0 : (capacity.get(v.id) ?? 0),
        expiry,
        expiryDate: expiry?.kind === "DATED" ? expiry.date : null,
      };
    }),
  };
}

export async function getStoreProduct(slug: string, locale: string, now = new Date()) {
  const content = await loadProductContent(slug, locale);
  return content ? withProductStock(content, now) : null;
}

/**
 * Dòng giỏ hàng kèm giá/tên hiện hành; dòng không còn bán hoặc vượt tồn bị đánh dấu.
 * QT3: vượt tồn nhưng trong hạn mức đặt trước → hợp lệ, `preorder: true` (cả đơn sẽ là đơn đặt trước).
 */
export async function getCartDetails(lines: CartLine[], locale: string) {
  if (lines.length === 0) return { lines: [], subtotalMmk: 0, ok: false, preorder: false };
  const variants = await prisma.variant.findMany({
    where: { id: { in: lines.map((l) => l.variantId) } },
    include: { product: { include: { translations: true } } },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  const [avail, capacity] = await Promise.all([availability(variants.map((v) => v.id)), preorderCapacity(prisma, variants.map((v) => v.id))]);
  const rows = lines.flatMap((l) => {
    const v = byId.get(l.variantId);
    if (!v) return [];
    const sellable = v.active && v.product.published && !v.product.archivedAt;
    const available = sellable ? (avail.get(v.id) ?? 0) : 0;
    const preorder = sellable && l.qty > available && l.qty <= (capacity.get(v.id) ?? 0);
    return [
      {
        variantId: v.id,
        slug: v.product.slug,
        name: pick(v.product.translations, locale)?.name ?? v.product.slug,
        label: v.label,
        standard: isStandardVariantLabel(v.label),
        priceMmk: v.priceMmk,
        qty: l.qty,
        available,
        preorder,
        preorderLimit: capacity.get(v.id) ?? 0,
        ok: sellable && (l.qty <= available || preorder),
      },
    ];
  });
  return {
    lines: rows,
    subtotalMmk: rows.reduce((s, r) => s + r.priceMmk * r.qty, 0),
    ok: rows.length > 0 && rows.every((r) => r.ok),
    preorder: rows.some((r) => r.preorder),
  };
}
