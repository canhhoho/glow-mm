import "server-only";
import { prisma } from "@/lib/db";
import { productName } from "@/server/inventory/queries";

/** Truy vấn cho trang /admin/pricing (chỉ đọc). */

export async function listRates(take = 10) {
  return prisma.exchangeRate.findMany({ orderBy: { effectiveAt: "desc" }, take });
}

/** Số bản xem trước chưa áp dụng/huỷ — hiện cạnh tab "Tính giá". */
export async function countPreviewRuns() {
  return prisma.priceUpdateRun.count({ where: { status: "PREVIEW" } });
}

export async function listRuns(take = 20) {
  return prisma.priceUpdateRun.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: { rate: true, location: { select: { name: true } }, _count: { select: { lines: true, history: true } } },
  });
}

export async function getRun(id: string) {
  const run = await prisma.priceUpdateRun.findUnique({
    where: { id },
    include: {
      rate: true,
      location: { select: { name: true, pricingMode: true } },
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
      costMmk: l.costMmk,
      shipMmk: l.shipMmk,
      profitMmk: l.profitMmk,
      oldPriceMmk: l.oldPriceMmk,
      newPriceMmk: l.newPriceMmk,
      currentPriceMmk: l.variant.priceMmk,
    })),
  };
}

/** Biến thể đang bán chưa có lô nào → không tính được giá vốn. */
export async function variantsWithoutCost() {
  const rows = await prisma.variant.findMany({
    where: { active: true, isBundle: false, batches: { none: {} }, product: { archivedAt: null } },
    select: { sku: true },
    orderBy: { sku: "asc" },
  });
  return rows.map((r) => r.sku);
}

/**
 * P24: biến thể của từng kho bán chưa tính được giá — thiếu vốn đúng loại tiền (lô VND / lô MMK),
 * thiếu khối lượng (kho hàng nhập VN: phí ship theo kg), thiếu lãi cố định (kho mua MMK).
 */
export async function pricingGaps() {
  const locations = await prisma.location.findMany({
    where: { sellable: true, active: true },
    orderBy: [{ pricingMode: "asc" }, { code: "asc" }],
    select: { id: true, name: true, pricingMode: true },
  });
  return Promise.all(
    locations.map(async (l) => {
      const mmk = l.pricingMode === "LOCAL_MMK";
      const variants = await prisma.variant.findMany({
        where: { active: true, product: { stockLocationId: l.id, archivedAt: null } },
        orderBy: { sku: "asc" },
        select: {
          sku: true,
          isBundle: true,
          weightGrams: true,
          product: { select: { fixedProfitMmk: true } },
          batches: { where: mmk ? { unitCostMmk: { not: null } } : { unitCostVnd: { not: null } }, take: 1, select: { id: true } },
        },
      });
      return {
        location: l,
        missingCost: variants.filter((v) => !v.isBundle && v.batches.length === 0).map((v) => v.sku),
        missingWeight: mmk ? [] : variants.filter((v) => !v.weightGrams).map((v) => v.sku),
        missingProfit: mmk ? variants.filter((v) => v.product.fixedProfitMmk == null).map((v) => v.sku) : [],
      };
    }),
  );
}

/** Đơn giá ship MMK/kg của lần tính giá Kho hàng nhập VN gần nhất → giá trị mặc định ô nhập. */
export async function lastShipRate() {
  const run = await prisma.priceUpdateRun.findFirst({ where: { shipMmkPerKg: { not: null } }, orderBy: { createdAt: "desc" }, select: { shipMmkPerKg: true } });
  return run?.shipMmkPerKg ?? null;
}

export async function listPriceHistory(take = 50) {
  return prisma.priceHistory.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: { variant: { select: { sku: true, label: true } } },
  });
}

export async function pricingFilterOptions() {
  const [categories, brands, warehouses] = await Promise.all([
    prisma.category.findMany({ include: { translations: true }, orderBy: { sortOrder: "asc" } }),
    prisma.brand.findMany({ orderBy: { name: "asc" } }),
    prisma.location.findMany({
      where: { sellable: true, active: true },
      orderBy: [{ pricingMode: "asc" }, { code: "asc" }],
      select: { id: true, name: true, pricingMode: true },
    }),
  ]);
  return {
    categories: categories.map((c) => ({ id: c.id, name: productName(c.translations, c.slug) })),
    brands: brands.map((b) => ({ id: b.id, name: b.name })),
    warehouses: warehouses.map((w) => ({ id: w.id, name: w.name, pricingMode: w.pricingMode ?? ("VN_IMPORT" as const) })),
  };
}
