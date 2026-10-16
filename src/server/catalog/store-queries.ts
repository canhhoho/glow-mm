import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { searchVariants } from "@/lib/myanmar";
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

async function availability(variantIds: string[]) {
  const blockDays = await salesBlockDays();
  return prisma.$transaction((tx) => availableToSell(tx, variantIds, { now: new Date(), blockDays }));
}

export async function listStoreProducts(query: ProductListQuery) {
  const and: Prisma.ProductWhereInput[] = [{ published: true }, { variants: { some: { active: true } } }];
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
        { variants: { some: { sku: { contains: q.toUpperCase() } } } },
      ],
    });
  }

  const products = await prisma.product.findMany({
    where: { AND: and },
    orderBy: { createdAt: "desc" },
    take: Math.min(query.take ?? 60, 60),
    include: {
      brand: true,
      translations: true,
      images: { orderBy: { sortOrder: "asc" }, take: 1, include: { file: { select: { url: true } } } },
      variants: { where: { active: true }, select: { id: true, priceMmk: true } },
    },
  });
  const avail = await availability(products.flatMap((p) => p.variants.map((v) => v.id)));

  const cards = products.map((p) => ({
    slug: p.slug,
    name: pick(p.translations, query.locale)?.name ?? p.slug,
    brand: p.brand.name,
    priceMmk: Math.min(...p.variants.map((v) => v.priceMmk)),
    imageUrl: p.images[0]?.file.url ?? null,
    imageAlt: p.images[0]?.alt ?? null,
    inStock: p.variants.some((v) => (avail.get(v.id) ?? 0) > 0),
  }));
  if (query.sort === "price_asc") cards.sort((a, b) => a.priceMmk - b.priceMmk);
  if (query.sort === "price_desc") cards.sort((a, b) => b.priceMmk - a.priceMmk);
  return cards;
}
export type ProductCardData = Awaited<ReturnType<typeof listStoreProducts>>[number];

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

export async function getStoreProduct(slug: string, locale: string, now = new Date()) {
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

  const ids = p.variants.map((v) => v.id);
  const blockDays = await salesBlockDays();
  const [avail, lots] = await Promise.all([
    prisma.$transaction((tx) => availableToSell(tx, ids, { now, blockDays })),
    // Hạn dùng của lô sẽ xuất tiếp theo (FEFO) — chỉ lô còn bán được ở kho bán.
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
    variants: p.variants.map((v) => ({
      id: v.id,
      label: v.label,
      priceMmk: v.priceMmk,
      isBundle: v.isBundle,
      available: avail.get(v.id) ?? 0,
      expiryDate: nextExpiry.get(v.id) ?? null,
    })),
  };
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

export async function storeShippingZones(locale: string) {
  const zones = await prisma.shippingZone.findMany({
    where: { active: true, rates: { some: {} } },
    orderBy: [{ region: "asc" }, { township: "asc" }],
    include: { rates: { take: 1 } },
  });
  return zones.map((z) => ({
    id: z.id,
    name: locale === "my" ? z.nameMy : z.nameEn,
    region: z.region,
    feeMmk: z.rates[0].feeMmk,
    freeFromMmk: z.rates[0].freeFromMmk,
  }));
}
