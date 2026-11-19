import "server-only";
import { inventoryCost } from "@/server/inventory/cost";
import { salesBlockDays } from "@/server/inventory/documents";
import { isSourceForProduct } from "@/server/pricing/cost";
import { changeRequestsFor } from "./change-request";
import { latestRate } from "@/server/pricing/latest-rate";
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
      preorderEnabled: true,
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
          purchasePriceAt: true,
          bundleItems: { select: { componentId: true, component: { select: { weightGrams: true, active: true, purchasePriceAt: true, product: { select: { archivedAt: true } } } } } },
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
        select: { variantId: true, qty: true, stockType: true, document: { select: { type: true, postedAt: true, to: { select: { id: true, sellable: true, type: true } } } } },
      })
    : [];
  const received = new Set(receivedRows.map((r) => r.variantId));
  // QT1b PRICE_STALE: lần ghi sổ phiếu NHẬP mới nhất theo biến thể so với lần đổi giá gần nhất (PriceHistory).
  // Chưa có lịch sử giá (giá đặt lúc tạo theo cách cũ) → không đoán, không cảnh báo.
  // A1 16/11: cùng điều kiện nguồn giá mua (hàng bán được, không vào khu chờ kiểm tra, không vào kho bán khác).
  const ownerLocation = new Map(products.flatMap((p) => p.variants.flatMap((v) => [[v.id, p.stockLocationId] as const, ...v.bundleItems.map((b) => [b.componentId, p.stockLocationId] as const)])));
  const lastReceive = new Map<string, number>();
  for (const r of receivedRows) {
    if (r.document.type !== "RECEIVE" || r.qty <= 0 || !r.document.postedAt || r.stockType !== "SELLABLE") continue;
    if (r.document.to?.type === "QUARANTINE" || !isSourceForProduct(r.document.to, ownerLocation.get(r.variantId) ?? null)) continue;
    lastReceive.set(r.variantId, Math.max(lastReceive.get(r.variantId) ?? 0, r.document.postedAt.getTime()));
  }
  const allVariantIds = products.flatMap((p) => p.variants.map((v) => v.id));
  const priceChanges = allVariantIds.length
    ? await db.priceHistory.groupBy({ by: ["variantId"], where: { variantId: { in: allVariantIds } }, _max: { createdAt: true } })
    : [];
  const lastPriceChange = new Map(priceChanges.map((c) => [c.variantId, c._max.createdAt?.getTime() ?? 0]));
  // 16/11: giá đang chờ duyệt cũng là "lần đặt giá" — đặt sau phiếu nhập / tỷ giá mới → không còn cảnh báo cần tính lại.
  for (const cr of (await changeRequestsFor(db, products.map((p) => p.id))).values()) {
    for (const [variantId, sp] of Object.entries(cr.prices)) {
      const at = sp.stagedAt ? Date.parse(sp.stagedAt) : NaN;
      if (Number.isFinite(at)) lastPriceChange.set(variantId, Math.max(lastPriceChange.get(variantId) ?? 0, at));
    }
  }
  // P1-D (M5): tỷ giá đang hiệu lực mới hơn lần đổi giá gần nhất (chỉ kho nhập VN; chưa có lịch sử giá → không đoán).
  const rateAt = (await latestRate(db, now))?.effectiveAt.getTime() ?? 0;

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
        // 19/11/2026: mốc = lần nhập hợp lệ mới nhất HOẶC lần đổi giá mua (sửa tay / Excel) — cái nào sau.
        const at = (id: string, purchaseAt: Date | null) => Math.max(lastReceive.get(id) ?? 0, purchaseAt?.getTime() ?? 0);
        const receivedAt = Math.max(0, ...(v.isBundle ? v.bundleItems.map((b) => at(b.componentId, b.component.purchasePriceAt)) : [at(v.id, v.purchasePriceAt)]));
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
          inactiveComponent: hasInactiveComponent(v),
        })),
        available,
        costMissingSkus: skusWhere(here, (b) => inventoryCost(b.batch).costStatus === "MISSING"),
        costEstimatedSkus: skusWhere(here, (b) => inventoryCost(b.batch).costStatus === "ESTIMATED"),
        // Tồn ở kho bán khác kho của SP → không bán được cho đến khi chuyển kho.
        otherWarehouseSkus: skusWhere(mine, (b) => b.locationId !== p.stockLocationId),
        staleSkus,
        rateNewerSkus:
          p.stockLocation?.pricingMode === "VN_IMPORT"
            ? p.variants
                .filter((v) => v.active && v.priceMmk > 0 && (lastPriceChange.get(v.id) ?? 0) > 0 && lastPriceChange.get(v.id)! < rateAt)
                .map((v) => v.sku)
                .sort()
            : [],
        preorderEnabled: p.preorderEnabled,
      }),
    });
  }
  return out;
}

/** Combo có thành phần đã tắt hoặc thuộc SP ngừng kinh doanh (#6). */
function hasInactiveComponent(v: { isBundle: boolean; bundleItems: { component: { active: boolean; product: { archivedAt: Date | null } } }[] }) {
  return v.isBundle && v.bundleItems.some((b) => !b.component.active || b.component.product.archivedAt != null);
}

/**
 * Chỉ lỗi chặn mở bán (`errors`) cho nhiều SP — dùng cho số đếm/tab "Chờ hoàn thiện".
 * Lỗi chỉ phụ thuộc biến thể (đang bán, giá, khối lượng) và kho của SP, không phụ thuộc tồn / giá vốn / tỷ giá,
 * nên bỏ hẳn các truy vấn kho của `loadReadiness` (nặng khi có hàng nghìn SP nháp: badge menu chạy ở mọi trang admin).
 * Kết quả `errors` trùng với `loadReadiness` (test readiness-errors đối chiếu).
 */
export async function loadReadinessErrors(db: Tx, productIds: string[]): Promise<Map<string, Issue[]>> {
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return new Map();
  const products = await db.product.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      stockLocation: { select: { active: true, sellable: true, pricingMode: true } },
      variants: {
        select: {
          id: true,
          sku: true,
          active: true,
          priceMmk: true,
          weightGrams: true,
          isBundle: true,
          bundleItems: { select: { component: { select: { weightGrams: true, active: true, product: { select: { archivedAt: true } } } } } },
        },
      },
    },
  });
  const none = new Map<string, number>();
  return new Map(
    products.map((p) => [
      p.id,
      evaluateReadiness({
        location: p.stockLocation,
        imageCount: 0,
        content: [],
        variants: p.variants.map((v) => ({
          id: v.id,
          sku: v.sku,
          active: v.active,
          priceMmk: v.priceMmk,
          weightGrams: v.weightGrams,
          isBundle: v.isBundle,
          componentWeights: v.isBundle ? v.bundleItems.map((b) => b.component.weightGrams) : null,
          inactiveComponent: hasInactiveComponent(v),
        })),
        available: none,
        costMissingSkus: [],
        costEstimatedSkus: [],
        otherWarehouseSkus: [],
      }).errors,
    ]),
  );
}

/** Bật hiển thị bị chặn vì còn lỗi — action dịch `issues` sang câu báo theo ngôn ngữ admin. */
export class ReadinessError extends Error {
  constructor(public readonly issues: Issue[]) {
    super(`Chưa đủ điều kiện mở bán: ${issues.map((i) => (i.skus?.length ? `${i.code} (${i.skus.join(", ")})` : i.code)).join("; ")}`);
    this.name = "ReadinessError";
  }
}
