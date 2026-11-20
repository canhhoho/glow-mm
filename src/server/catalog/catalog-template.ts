import "server-only";
import { prisma } from "@/lib/db";
import { productName } from "@/server/inventory/queries";
import type { SheetLocale } from "@/lib/catalog-sheet";
import { buildCatalogWorkbook, type TemplateRow } from "./catalog-workbook";

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
 * File mẫu trống / file SP hiện có — cùng bộ cột với form SP (16/11/2026: không còn cột giá, tên Myanmar, "Có hạn dùng";
 * giá đặt ở trang Giá bán). `locale`: ngôn ngữ tiêu đề theo admin. Cột Kho nhập của file SP hiện có ghi kho bán đang có.
 */
export async function catalogTemplateFile(withProducts: boolean, opts: { locale?: SheetLocale } = {}): Promise<Uint8Array> {
  const { lists, categoryLabel, warehouseCode } = await loadLists();
  if (!withProducts) return buildCatalogWorkbook(lists, [], { locale: opts.locale });
  const products = await prisma.product.findMany({
    where: { archivedAt: null },
    orderBy: { slug: "asc" },
    select: {
      id: true,
      categoryId: true,
      stockLocationId: true,
      stockLocation: { select: { pricingMode: true } },
      storageNote: true,
      paoMonths: true,
      brand: { select: { name: true } },
      translations: { select: { locale: true, name: true, description: true, usage: true, ingredientsText: true } },
      variants: { where: { isBundle: false }, orderBy: { sku: "asc" }, select: { id: true, sku: true, label: true, weightGrams: true, purchasePriceVnd: true, purchasePriceMmk: true, plannedReceiveQty: true } },
    },
  });
  const rows: TemplateRow[] = products.flatMap((p) => {
    const tr = (l: string) => p.translations.find((t) => t.locale === l);
    return p.variants.map((v) => ({
      // Một ô tên: tên tiếng Anh (tên dùng chung), thiếu thì tên Myanmar.
      name: tr("en")?.name || tr("my")?.name,
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
      // Giá mua hiện tại theo tiền của kho (19/11/2026) — nhập lại file với Số lượng trống giữ nguyên giá mua.
      unit_cost: (p.stockLocation?.pricingMode === "LOCAL_MMK" ? v.purchasePriceMmk : v.purchasePriceVnd) ?? undefined,
      // SL dự kiến nhập hiện tại (0 = để trống, nhập lại file không đổi gì).
      qty: v.plannedReceiveQty || undefined,
      sku: v.sku,
    }));
  });
  return buildCatalogWorkbook(lists, rows, { locale: opts.locale });
}
