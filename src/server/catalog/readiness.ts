import "server-only";
import { inventoryCost } from "@/server/inventory/cost";
import { salesBlockDays } from "@/server/inventory/documents";
import type { Tx } from "@/server/inventory/ledger";
import { availableToSell } from "@/server/orders/availability";
import { evaluateReadiness, type Issue, type Readiness } from "./readiness-rules";

/**
 * D2: nạp dữ liệu và đánh giá "sẵn sàng mở bán" cho nhiều SP một lần (số truy vấn cố định, không theo từng SKU).
 * Dùng chung cho lưu SP, bật hàng loạt, danh sách và trang chi tiết.
 */
export async function loadReadiness(db: Tx, productIds: string[], now = new Date()): Promise<Map<string, Readiness>> {
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return new Map();
  const products = await db.product.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      stockLocationId: true,
      stockLocation: { select: { active: true, sellable: true, pricingMode: true } },
      images: { orderBy: { sortOrder: "asc" }, select: { alt: true } },
      translations: { where: { locale: { in: ["my", "en"] } }, select: { description: true, usage: true } },
      variants: {
        select: {
          id: true,
          sku: true,
          active: true,
          priceMmk: true,
          weightGrams: true,
          isBundle: true,
          bundleItems: { select: { component: { select: { weightGrams: true } } } },
        },
      },
    },
  });
  const activeIds = products.flatMap((p) => p.variants.filter((v) => v.active).map((v) => v.id));
  // Tuần tự: `db` có thể là transaction (một kết nối) khi gọi từ saveProduct / bật hàng loạt.
  const available = activeIds.length ? await availableToSell(db, activeIds, { now, blockDays: await salesBlockDays() }) : new Map<string, number>();
  const balances = await db.stockBalance.findMany({
    where: { qty: { gt: 0 }, stockType: "SELLABLE", location: { sellable: true }, batch: { variant: { productId: { in: ids } } } },
    select: {
      locationId: true,
      batch: { select: { landedCostMmk: true, estimatedCostMmk: true, variant: { select: { sku: true, productId: true } } } },
    },
  });

  const out = new Map<string, Readiness>();
  for (const p of products) {
    const mine = balances.filter((b) => b.batch.variant.productId === p.id);
    const here = mine.filter((b) => b.locationId === p.stockLocationId);
    const skusWhere = (rows: typeof mine, pred: (r: (typeof mine)[number]) => boolean) => [...new Set(rows.filter(pred).map((r) => r.batch.variant.sku))].sort();
    out.set(
      p.id,
      evaluateReadiness({
        location: p.stockLocation,
        imageCount: p.images.length,
        coverHasAlt: !!p.images[0]?.alt?.trim(),
        content: p.translations,
        variants: p.variants.map((v) => ({
          id: v.id,
          sku: v.sku,
          active: v.active,
          priceMmk: v.priceMmk,
          weightGrams: v.weightGrams,
          isBundle: v.isBundle,
          componentWeights: v.isBundle ? v.bundleItems.map((b) => b.component.weightGrams) : null,
        })),
        available,
        costMissingSkus: skusWhere(here, (b) => inventoryCost(b.batch).costStatus === "MISSING"),
        costEstimatedSkus: skusWhere(here, (b) => inventoryCost(b.batch).costStatus === "ESTIMATED"),
        // Tồn ở kho bán khác kho của SP → không bán được cho đến khi chuyển kho.
        otherWarehouseSkus: skusWhere(mine, (b) => b.locationId !== p.stockLocationId),
      }),
    );
  }
  return out;
}

/** Bật hiển thị bị chặn vì còn lỗi — action dịch `issues` sang câu báo theo ngôn ngữ admin. */
export class ReadinessError extends Error {
  constructor(public readonly issues: Issue[]) {
    super(`Chưa đủ điều kiện mở bán: ${issues.map((i) => (i.skus?.length ? `${i.code} (${i.skus.join(", ")})` : i.code)).join("; ")}`);
    this.name = "ReadinessError";
  }
}
