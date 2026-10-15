import "server-only";
import { prisma } from "@/lib/db";
import { productName } from "@/server/inventory/queries";

/** Truy vấn cho trang /admin/pricing (chỉ đọc). */

export async function listRates(take = 10) {
  return prisma.exchangeRate.findMany({ orderBy: { effectiveAt: "desc" }, take });
}

export async function listRuns(take = 20) {
  return prisma.priceUpdateRun.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: { rate: true, _count: { select: { lines: true, history: true } } },
  });
}

export async function getRun(id: string) {
  const run = await prisma.priceUpdateRun.findUnique({
    where: { id },
    include: {
      rate: true,
      lines: {
        include: { variant: { include: { product: { include: { translations: true } } } } },
        orderBy: { variant: { sku: "asc" } },
      },
    },
  });
  if (!run) return null;
  return {
    ...run,
    lines: run.lines.map((l) => ({
      variantId: l.variantId,
      sku: l.variant.sku,
      name: `${productName(l.variant.product.translations, l.variant.product.slug)} (${l.variant.label})`,
      costVnd: l.costVnd,
      oldPriceMmk: l.oldPriceMmk,
      newPriceMmk: l.newPriceMmk,
      currentPriceMmk: l.variant.priceMmk,
    })),
  };
}

/** Biến thể đang bán chưa có lô nào → không tính được giá vốn. */
export async function variantsWithoutCost() {
  const rows = await prisma.variant.findMany({
    where: { active: true, isBundle: false, batches: { none: {} } },
    select: { sku: true },
    orderBy: { sku: "asc" },
  });
  return rows.map((r) => r.sku);
}

export async function listPriceHistory(take = 50) {
  return prisma.priceHistory.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: { variant: { select: { sku: true, label: true } } },
  });
}

export async function pricingFilterOptions() {
  const [categories, brands] = await Promise.all([
    prisma.category.findMany({ include: { translations: true }, orderBy: { sortOrder: "asc" } }),
    prisma.brand.findMany({ orderBy: { name: "asc" } }),
  ]);
  return {
    categories: categories.map((c) => ({ id: c.id, name: productName(c.translations, c.slug) })),
    brands: brands.map((b) => ({ id: b.id, name: b.name })),
  };
}
