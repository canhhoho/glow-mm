import "server-only";
import { prisma } from "@/lib/db";
import { productName } from "@/server/inventory/queries";
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

export async function catalogTemplateFile(withProducts: boolean): Promise<Uint8Array> {
  const { lists, categoryLabel, warehouseCode } = await loadLists();
  if (!withProducts) return buildCatalogWorkbook(lists);
  const products = await prisma.product.findMany({
    where: { archivedAt: null },
    orderBy: { slug: "asc" },
    select: {
      categoryId: true,
      stockLocationId: true,
      requiresExpiry: true,
      brand: { select: { name: true } },
      translations: { select: { locale: true, name: true, description: true } },
      variants: { where: { isBundle: false }, orderBy: { sku: "asc" }, select: { sku: true, label: true, priceMmk: true, weightGrams: true } },
    },
  });
  const rows: TemplateRow[] = products.flatMap((p) => {
    const tr = (l: string) => p.translations.find((t) => t.locale === l);
    return p.variants.map((v) => ({
      name_my: tr("my")?.name,
      name_en: tr("en")?.name,
      brand: p.brand.name,
      category: categoryLabel.get(p.categoryId),
      variant_label: v.label,
      price_mmk: v.priceMmk,
      weight_g: v.weightGrams,
      description_my: tr("my")?.description,
      description_en: tr("en")?.description,
      warehouse_code: warehouseCode.get(p.stockLocationId),
      has_expiry: p.requiresExpiry ? "Có" : "Không",
      sku: v.sku,
    }));
  });
  return buildCatalogWorkbook(lists, rows);
}
