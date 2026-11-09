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
/** `notReceivedSkus`: biến thể đang dùng chưa từng có phiếu nhập/chuyển kho đã ghi sổ (combo: xét thành phần) — bước 2. */
export type LoadedReadiness = Readiness & { notReceivedSkus: string[] };

export async function loadReadiness(db: Tx, productIds: string[], now = new Date()): Promise<Map<string, LoadedReadiness>> {
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return new Map();
  const products = await db.product.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      stockLocationId: true,
      approvedAt: true,
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
          bundleItems: { select: { componentId: true, component: { select: { weightGrams: true } } } },
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

  // Bước 2: đã từng nhập (RECEIVE) hoặc chuyển kho (TRANSFER) đã ghi sổ — một truy vấn cho mọi biến thể + thành phần combo.
  const stockVariantIds = [...new Set(products.flatMap((p) => p.variants.flatMap((v) => (v.isBundle ? v.bundleItems.map((b) => b.componentId) : [v.id]))))];
  const receivedRows = stockVariantIds.length
    ? await db.stockDocumentLine.findMany({
        where: { variantId: { in: stockVariantIds }, document: { status: "POSTED", type: { in: ["RECEIVE", "TRANSFER"] } } },
        select: { variantId: true, qty: true, document: { select: { type: true, postedAt: true } } },
      })
    : [];
  const received = new Set(receivedRows.map((r) => r.variantId));
  // QT1b PRICE_STALE: lần ghi sổ phiếu NHẬP mới nhất theo biến thể so với lần đổi giá gần nhất (PriceHistory).
  // Chưa có lịch sử giá (giá đặt lúc tạo theo cách cũ) → không đoán, không cảnh báo.
  const lastReceive = new Map<string, number>();
  for (const r of receivedRows) {
    if (r.document.type !== "RECEIVE" || r.qty <= 0 || !r.document.postedAt) continue;
    lastReceive.set(r.variantId, Math.max(lastReceive.get(r.variantId) ?? 0, r.document.postedAt.getTime()));
  }
  const allVariantIds = products.flatMap((p) => p.variants.map((v) => v.id));
  const priceChanges = allVariantIds.length
    ? await db.priceHistory.groupBy({ by: ["variantId"], where: { variantId: { in: allVariantIds } }, _max: { createdAt: true } })
    : [];
  const lastPriceChange = new Map(priceChanges.map((c) => [c.variantId, c._max.createdAt?.getTime() ?? 0]));

  const out = new Map<string, LoadedReadiness>();
  for (const p of products) {
    const mine = balances.filter((b) => b.batch.variant.productId === p.id);
    const here = mine.filter((b) => b.locationId === p.stockLocationId);
    const skusWhere = (rows: typeof mine, pred: (r: (typeof mine)[number]) => boolean) => [...new Set(rows.filter(pred).map((r) => r.batch.variant.sku))].sort();
    const notReceivedSkus = p.variants
      .filter((v) => v.active && !(v.isBundle ? v.bundleItems.length > 0 && v.bundleItems.every((b) => received.has(b.componentId)) : received.has(v.id)))
      .map((v) => v.sku)
      .sort();
    const staleSkus = p.variants
      .filter((v) => {
        const changed = lastPriceChange.get(v.id);
        if (!v.active || v.priceMmk <= 0 || !changed) return false;
        const receivedAt = Math.max(0, ...(v.isBundle ? v.bundleItems.map((b) => lastReceive.get(b.componentId) ?? 0) : [lastReceive.get(v.id) ?? 0]));
        return receivedAt > changed;
      })
      .map((v) => v.sku)
      .sort();
    out.set(p.id, {
      notReceivedSkus,
      ...evaluateReadiness({
        location: p.stockLocation,
        imageCount: p.images.length,
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
        staleSkus,
        approved: p.approvedAt != null,
      }),
    });
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
