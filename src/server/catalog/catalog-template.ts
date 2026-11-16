import "server-only";
import { prisma } from "@/lib/db";
import { productName } from "@/server/inventory/queries";
import { buildCatalogWorkbook, type TemplateRow } from "./catalog-workbook";
import { changeRequestsFor, effectiveCommission, effectivePrice } from "./change-request";

/** Danh sách thả xuống từ DB; tên danh mục trùng nhau thì dùng mã (slug) để không nhầm. */
async function loadLists() {
  const [brands, categories, warehouses] = await Promise.all([
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
    prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { slug: "asc" }], select: { id: true, slug: true, translations: { select: { locale: true, name: true } } } }),
    prisma.location.findMany({ where: { sellable: true, active: true }, orderBy: [{ pricingMode: "asc" }, { code: "asc" }], select: { id: true, code: true } }),
  ]);
  const names = categories.map((c) => productName(c.translations, c.slug));
  const categoryLabel = new Map(categories.map((c, i) => [c.id, names.filter((n) => n === names[i]).length > 1 ? c.slug : names[i]]));
  return {
    lists: { brands: brands.map((b) => b.name), categories: [...categoryLabel.values()], warehouses: warehouses.map((w) => w.code) },
    categoryLabel,
    warehouseCode: new Map(warehouses.map((w) => [w.id, w.code])),
  };
}

/**
 * `withPricing`: thêm cột giá bán / hoa hồng CTV (chỉ file SP hiện có, người có quyền giá). Giá / hoa hồng = giá trị
 * HIỆU LỰC (đang chờ duyệt nếu có, nếu không là đang bán) → nhập lại file không sửa gì sẽ không đổi / huỷ giá chờ (A2 16/11).
 */
export async function catalogTemplateFile(withProducts: boolean, opts: { withPricing?: boolean } = {}): Promise<Uint8Array> {
  const { lists, categoryLabel, warehouseCode } = await loadLists();
  if (!withProducts) return buildCatalogWorkbook(lists);
  const products = await prisma.product.findMany({
    where: { archivedAt: null },
    orderBy: { slug: "asc" },
    select: {
      id: true,
      categoryId: true,
      stockLocationId: true,
      requiresExpiry: true,
      storageNote: true,
      paoMonths: true,
      brand: { select: { name: true } },
      translations: { select: { locale: true, name: true, description: true, usage: true, ingredientsText: true } },
      variants: { where: { isBundle: false }, orderBy: { sku: "asc" }, select: { id: true, sku: true, label: true, weightGrams: true, priceMmk: true, affiliateCommissionMmk: true } },
    },
  });
  const staged = opts.withPricing ? await changeRequestsFor(prisma, products.map((p) => p.id)) : new Map();
  const rows: TemplateRow[] = products.flatMap((p) => {
    const pending = staged.get(p.id)?.prices ?? {};
    const tr = (l: string) => p.translations.find((t) => t.locale === l);
    return p.variants.map((v) => ({
      name_my: tr("my")?.name,
      name_en: tr("en")?.name,
      brand: p.brand.name,
      category: categoryLabel.get(p.categoryId),
      variant_label: v.label,
      weight_g: v.weightGrams,
      description_my: tr("my")?.description,
      description_en: tr("en")?.description,
      usage_my: tr("my")?.usage,
      usage_en: tr("en")?.usage,
      ingredients: tr("en")?.ingredientsText || tr("my")?.ingredientsText,
      storage_note: p.storageNote,
      pao_months: p.paoMonths,
      warehouse_code: p.stockLocationId ? warehouseCode.get(p.stockLocationId) : undefined,
      has_expiry: p.requiresExpiry ? "Có" : "Không",
      sku: v.sku,
      ...(opts.withPricing && { price_mmk: effectivePrice(pending[v.id], v.priceMmk) || null, affiliate_commission_mmk: effectiveCommission(pending[v.id], v.affiliateCommissionMmk) }),
    }));
  });
  return buildCatalogWorkbook(lists, rows, { pricing: opts.withPricing });
}
