import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { productName } from "@/server/inventory/queries";

/** `ready` / `incomplete` (D2): SP đang ẩn, lọc thêm theo kiểm tra mở bán ở trang danh sách. */
/**
 * P1-A: review = hàng đợi Chờ duyệt (SP mới gửi duyệt + thay đổi của SP đã duyệt đã gửi) · rejected = bị từ chối ·
 * draft = SP chưa từng duyệt, chưa gửi. Tham số cũ `toApprove` / `reapprove` (link cũ) → review.
 */
export const PRODUCT_STATUSES = ["active", "published", "hidden", "review", "rejected", "draft", "ready", "incomplete", "archived"] as const;
export type ProductStatusFilter = (typeof PRODUCT_STATUSES)[number];
export function parseProductStatus(v: unknown): ProductStatusFilter {
  if (v === "toApprove" || v === "reapprove") return "review";
  return PRODUCT_STATUSES.find((s) => s === v) ?? "active";
}

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
      ...(status === "review" && { approvalStatus: "PENDING" }),
      ...(status === "rejected" && { approvalStatus: "REJECTED" }),
      ...(status === "draft" && { approvedAt: null, approvalStatus: "DRAFT" }),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      brand: true,
      category: { include: { translations: true } },
      stockLocation: { select: { name: true } },
      translations: true,
      variants: true,
      changeRequest: { select: { productId: true } },
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
    archivedAt: p.archivedAt,
    approvedAt: p.approvedAt,
    approvalStatus: p.approvalStatus,
    approvalVersion: p.approvalVersion,
    hasChanges: p.changeRequest !== null,
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

/**
 * Lựa chọn cho form tạo/sửa SP. Gợi ý thương hiệu: chỉ thương hiệu có SP chưa ngừng kinh doanh (+ thương hiệu của SP
 * đang sửa, `brandId`) — thương hiệu chỉ còn SP ngừng KD không lẫn vào gợi ý; gõ đúng tên vẫn dùng lại được.
 */
export async function productFormOptions(brandId?: string) {
  const [brands, categories, tags, variants, warehouses] = await Promise.all([
    prisma.brand.findMany({
      where: { OR: [{ products: { some: { archivedAt: null } } }, ...(brandId ? [{ id: brandId }] : [])] },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({ include: { translations: true }, orderBy: { sortOrder: "asc" } }),
    prisma.tag.findMany({ include: { translations: true }, orderBy: [{ kind: "asc" }, { slug: "asc" }] }),
    prisma.variant.findMany({
      where: { isBundle: false },
      orderBy: { sku: "asc" },
      select: { id: true, sku: true, label: true, active: true, product: { select: { stockLocationId: true, archivedAt: true } } },
    }),
    stockLocationOptions(),
  ]);
  return {
    brands: brands.map((b) => ({ id: b.id, name: b.name })),
    categories: categories.map((c) => ({ id: c.id, name: productName(c.translations, c.slug) })),
    tags: tags.map((t) => ({ id: t.id, kind: t.kind, name: productName(t.translations, t.slug) })),
    // `inactive` / `archived`: bộ chọn chỉ gợi ý thành phần đang dùng cho lựa chọn MỚI; thành phần đã lưu vẫn hiện, có nhãn (#6).
    components: variants.map((v) => ({
      id: v.id,
      label: `${v.sku} (${v.label})`,
      stockLocationId: v.product.stockLocationId,
      inactive: !v.active,
      archived: v.product.archivedAt != null,
    })),
    warehouses,
  };
}

/** Include dùng chung cho form sửa SP và nhập Excel (cập nhật giữ nguyên các trường không có trong file). */
export const PRODUCT_EDIT_INCLUDE = {
  translations: true,
  tags: true,
  variants: { include: { bundleItems: true }, orderBy: { sku: "asc" } },
} satisfies Prisma.ProductInclude;
type ProductForEdit = Prisma.ProductGetPayload<{ include: typeof PRODUCT_EDIT_INCLUDE }>;

export async function getProductForEdit(id: string) {
  const p = await prisma.product.findUnique({ where: { id }, include: PRODUCT_EDIT_INCLUDE });
  return p ? toProductEditData(p) : null;
}

export function toProductEditData(p: ProductForEdit) {
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
      affiliateCommissionMmk: v.affiliateCommissionMmk,
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
