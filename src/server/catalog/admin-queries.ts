import "server-only";
import { prisma } from "@/lib/db";
import { productName } from "@/server/inventory/queries";

/** `ready` / `incomplete` (D2): SP đang ẩn, lọc thêm theo kiểm tra mở bán ở trang danh sách. */
export const PRODUCT_STATUSES = ["active", "published", "hidden", "ready", "incomplete", "archived"] as const;
export type ProductStatusFilter = (typeof PRODUCT_STATUSES)[number];

/**
 * Danh sách SP admin. `status`: active (mặc định — mọi SP trừ ngừng kinh doanh) · published · hidden · archived.
 * `categoryId` gồm cả danh mục con.
 */
export async function listProductsAdmin(
  filter: { q?: string; brandId?: string; categoryId?: string; warehouseId?: string; status?: ProductStatusFilter } = {},
) {
  const query = filter.q?.trim();
  const status = filter.status ?? "active";
  const products = await prisma.product.findMany({
    where: {
      ...(query && {
        OR: [
          { slug: { contains: query, mode: "insensitive" } },
          { translations: { some: { name: { contains: query, mode: "insensitive" } } } },
          { variants: { some: { sku: { contains: query, mode: "insensitive" } } } },
        ],
      }),
      ...(filter.brandId && { brandId: filter.brandId }),
      ...(filter.warehouseId && { stockLocationId: filter.warehouseId }),
      ...(filter.categoryId && { category: { OR: [{ id: filter.categoryId }, { parentId: filter.categoryId }] } }),
      archivedAt: status === "archived" ? { not: null } : null,
      ...(status === "published" && { published: true }),
      ...((status === "hidden" || status === "ready" || status === "incomplete") && { published: false }),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      brand: true,
      category: { include: { translations: true } },
      stockLocation: { select: { name: true } },
      translations: true,
      variants: true,
    },
    take: 300,
  });
  return products.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: productName(p.translations, p.slug),
    brand: p.brand.name,
    warehouse: p.stockLocation.name,
    category: productName(p.category.translations, p.category.slug),
    published: p.published,
    archived: p.archivedAt !== null,
    requiresExpiry: p.requiresExpiry,
    paoMonths: p.paoMonths,
    variants: p.variants.map((v) => ({ sku: v.sku, label: v.label, priceMmk: v.priceMmk, isBundle: v.isBundle })),
  }));
}

/** Ô lọc danh sách SP: thương hiệu + danh mục (con xếp ngay sau cha, có `depth`). */
export async function productFilterOptions() {
  const [brands, categories, warehouses] = await Promise.all([
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.category.findMany({ include: { translations: true }, orderBy: [{ sortOrder: "asc" }, { slug: "asc" }] }),
    stockLocationOptions(),
  ]);
  const named = categories.map((c) => ({ id: c.id, parentId: c.parentId, name: productName(c.translations, c.slug) }));
  const tree = named
    .filter((c) => !c.parentId || !named.some((p) => p.id === c.parentId))
    .flatMap((root) => [{ ...root, depth: 0 }, ...named.filter((c) => c.parentId === root.id).map((c) => ({ ...c, depth: 1 }))]);
  return {
    brands: brands.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" })), // "beplain" cạnh "BIODANCE", không dồn cuối
    categories: tree.map(({ id, name, depth }) => ({ id, name, depth })),
    warehouses,
  };
}

/** Kho bán đang dùng (ô chọn kho của SP, bộ lọc danh sách, nút "Đổi kho"). */
export async function stockLocationOptions() {
  return prisma.location.findMany({
    where: { sellable: true, active: true },
    orderBy: [{ pricingMode: "asc" }, { code: "asc" }],
    select: { id: true, code: true, name: true, pricingMode: true },
  });
}

export async function productCopyOptions() {
  const products = await prisma.product.findMany({
    orderBy: { slug: "asc" },
    select: { id: true, slug: true, translations: { select: { locale: true, name: true } } },
  });
  return products.map((p) => ({ id: p.id, label: `${productName(p.translations, p.slug)} (${p.slug})` }));
}

export async function productFormOptions() {
  const [brands, categories, tags, variants, warehouses] = await Promise.all([
    prisma.brand.findMany({ orderBy: { name: "asc" } }),
    prisma.category.findMany({ include: { translations: true }, orderBy: { sortOrder: "asc" } }),
    prisma.tag.findMany({ include: { translations: true }, orderBy: [{ kind: "asc" }, { slug: "asc" }] }),
    prisma.variant.findMany({
      where: { isBundle: false },
      orderBy: { sku: "asc" },
      select: { id: true, sku: true, label: true, product: { select: { stockLocationId: true } } },
    }),
    stockLocationOptions(),
  ]);
  return {
    brands: brands.map((b) => ({ id: b.id, name: b.name })),
    categories: categories.map((c) => ({ id: c.id, name: productName(c.translations, c.slug) })),
    tags: tags.map((t) => ({ id: t.id, kind: t.kind, name: productName(t.translations, t.slug) })),
    components: variants.map((v) => ({ id: v.id, label: `${v.sku} (${v.label})`, stockLocationId: v.product.stockLocationId })),
    warehouses,
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
    stockLocationId: p.stockLocationId,
    fixedProfitMmk: p.fixedProfitMmk,
    published: p.published,
    requiresExpiry: p.requiresExpiry,
    paoMonths: p.paoMonths,
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

export async function getProductImages(productId: string) {
  const images = await prisma.productImage.findMany({
    where: { productId },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: { file: { select: { url: true, size: true } } },
  });
  return images.map((i) => ({ id: i.id, url: i.file.url, size: i.file.size, alt: i.alt ?? "" }));
}

/** Danh mục gốc — chọn làm danh mục cha khi tạo danh mục con (cây 2 cấp). */
export async function rootCategories() {
  const cats = await prisma.category.findMany({
    where: { parentId: null },
    include: { translations: true },
    orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
  });
  return cats.map((c) => ({ id: c.id, name: productName(c.translations, c.slug) }));
}
