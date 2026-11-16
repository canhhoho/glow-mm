import "server-only";
import { COD_BUCKETS } from "@/server/orders/cod-aging";
import { prisma } from "@/lib/db";
import { inventoryCost } from "@/server/inventory/cost";
import { productName } from "@/server/inventory/queries";
import { postedReceiveBatch } from "@/server/pricing/cost";

/**
 * D0 — "Sức khoẻ dữ liệu": báo cáo CHỈ ĐỌC các chỗ dữ liệu sai/thiếu để người phụ trách sửa tay, và mốc thời gian
 * vận hành để so trước/sau các đợt tối ưu. Không tự sửa, không đoán giá/khối lượng/cước.
 * Mỗi mục trả tổng số + tối đa `ROW_LIMIT` dòng có liên kết tới chỗ sửa.
 */

export const ROW_LIMIT = 50;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Migration bỏ cộng cước hai lần — run giá áp dụng trước mốc này cần rà lại. */
const SHIP_FIX_MIGRATION = "20261105090000_estimated_inventory_cost";
export const STALE_DRAFT_DAYS = 3;
export const LONG_SHIPPING_DAYS = 7;

export type Severity = "error" | "warning" | "info";
export type HealthRow = { id: string; ref: string; name?: string; value?: string; href: string };
export type HealthCheck = { key: CheckKey; severity: Severity; count: number; rows: HealthRow[] };
export type CheckKey =
  | "publishedZeroPrice"
  | "hiddenZeroPrice"
  | "noImage"
  | "missingWeight"
  | "missingWeightLocal"
  | "badLocation"
  | "stockMissingCost"
  | "draftOnlyCost"
  | "comboMissingCost"
  | "oldShipRuns"
  | "lotShipmentMismatch"
  | "overdueOrders"
  | "longShipping"
  | "codExceptions"
  | "quarantine"
  | "staleDrafts";

const productHref = (id: string) => `/admin/products/${id}`;
const check = (key: CheckKey, severity: Severity, rows: HealthRow[], count = rows.length): HealthCheck => ({
  key,
  severity,
  count,
  rows: rows.slice(0, ROW_LIMIT),
});
const daysSince = (d: Date, now: Date) => Math.floor((now.getTime() - d.getTime()) / DAY_MS);

// ── Sản phẩm ───────────────────────────────────────────────────────────────

async function catalogChecks(): Promise<HealthCheck[]> {
  const [zero, noImage, weight, badLocation] = await Promise.all([
    prisma.variant.findMany({
      where: { active: true, priceMmk: { lte: 0 }, product: { archivedAt: null } },
      orderBy: { sku: "asc" },
      select: { id: true, sku: true, priceMmk: true, product: { select: { id: true, slug: true, published: true, translations: true } } },
    }),
    prisma.product.findMany({
      where: { archivedAt: null, images: { none: {} } },
      orderBy: [{ published: "desc" }, { slug: "asc" }],
      select: { id: true, slug: true, published: true, translations: true },
    }),
    prisma.variant.findMany({
      where: { active: true, product: { archivedAt: null }, OR: [{ weightGrams: null }, { weightGrams: { lte: 0 } }] },
      orderBy: { sku: "asc" },
      select: {
        id: true,
        sku: true,
        product: { select: { id: true, slug: true, translations: true, stockLocation: { select: { pricingMode: true } } } },
      },
    }),
    prisma.product.findMany({
      where: { archivedAt: null, stockLocation: { OR: [{ active: false }, { sellable: false }] } },
      orderBy: { slug: "asc" },
      select: { id: true, slug: true, translations: true, stockLocation: { select: { name: true } } },
    }),
  ]);
  const variantRow = (v: (typeof zero)[number] | (typeof weight)[number], value?: string): HealthRow => ({
    id: v.id,
    ref: v.sku,
    name: productName(v.product.translations, v.product.slug),
    value,
    href: productHref(v.product.id),
  });
  // Kho LOCAL_MMK không cần khối lượng để tính giá (chỉ cần cho VTP) → cảnh báo; kho VN_IMPORT/không chế độ → lỗi.
  const isLocal = (v: (typeof weight)[number]) => v.product.stockLocation?.pricingMode === "LOCAL_MMK";
  return [
    check("publishedZeroPrice", "error", zero.filter((v) => v.product.published).map((v) => variantRow(v, String(v.priceMmk)))),
    check("hiddenZeroPrice", "warning", zero.filter((v) => !v.product.published).map((v) => variantRow(v, String(v.priceMmk)))),
    check(
      "noImage",
      "warning",
      noImage.map((p) => ({ id: p.id, ref: p.slug, name: productName(p.translations, p.slug), value: p.published ? "published" : "hidden", href: productHref(p.id) })),
    ),
    check("missingWeight", "error", weight.filter((v) => !isLocal(v)).map((v) => variantRow(v))),
    check("missingWeightLocal", "warning", weight.filter(isLocal).map((v) => variantRow(v))),
    check(
      "badLocation",
      "error",
      badLocation.map((p) => ({ id: p.id, ref: p.slug, name: productName(p.translations, p.slug), value: p.stockLocation?.name ?? "", href: productHref(p.id) })),
    ),
  ];
}

// ── Giá vốn & nguồn giá ────────────────────────────────────────────────────

async function costChecks(): Promise<HealthCheck[]> {
  const [balances, draftOnly, bundles, fix] = await Promise.all([
    prisma.stockBalance.findMany({
      where: { qty: { gt: 0 }, stockType: "SELLABLE", location: { sellable: true } },
      select: {
        qty: true,
        batch: {
          select: {
            id: true,
            lotNo: true,
            landedCostMmk: true,
            estimatedCostMmk: true,
            variant: { select: { sku: true, product: { select: { slug: true, translations: true } } } },
          },
        },
      },
    }),
    // Có lô nhưng không lô nào thuộc phiếu nhập đã ghi sổ → tính giá bỏ qua biến thể này.
    prisma.variant.findMany({
      where: { active: true, isBundle: false, product: { archivedAt: null }, batches: { some: {}, none: postedReceiveBatch } },
      orderBy: { sku: "asc" },
      select: { id: true, sku: true, product: { select: { id: true, slug: true, translations: true } } },
    }),
    prisma.variant.findMany({
      where: { active: true, isBundle: true, product: { archivedAt: null } },
      orderBy: { sku: "asc" },
      select: {
        id: true,
        sku: true,
        product: { select: { id: true, slug: true, translations: true, stockLocation: { select: { pricingMode: true } } } },
        bundleItems: {
          select: {
            component: {
              select: {
                sku: true,
                batches: { where: postedReceiveBatch, select: { unitCostVnd: true, unitCostMmk: true } },
              },
            },
          },
        },
      },
    }),
    prisma.$queryRaw<{ finished_at: Date | null }[]>`
      SELECT finished_at FROM "_prisma_migrations" WHERE migration_name = ${SHIP_FIX_MIGRATION} AND rolled_back_at IS NULL LIMIT 1`,
  ]);

  // Tồn bán được nhưng chưa có giá vốn (thực tế lẫn tạm) — gộp theo lô.
  const missing = new Map<string, HealthRow & { qty: number }>();
  for (const b of balances) {
    if (inventoryCost(b.batch).costStatus !== "MISSING") continue;
    const cur = missing.get(b.batch.id) ?? {
      id: b.batch.id,
      ref: `${b.batch.variant.sku} · ${b.batch.lotNo}`,
      name: productName(b.batch.variant.product.translations, b.batch.variant.product.slug),
      href: `/admin/inventory/batches/${b.batch.id}`,
      qty: 0,
    };
    cur.qty += b.qty;
    missing.set(b.batch.id, cur);
  }

  const comboRows: HealthRow[] = [];
  for (const v of bundles) {
    const mmk = v.product.stockLocation?.pricingMode === "LOCAL_MMK";
    const lacking = v.bundleItems
      .filter((i) => !i.component.batches.some((b) => (mmk ? b.unitCostMmk != null : b.unitCostVnd != null)))
      .map((i) => i.component.sku);
    if (v.bundleItems.length === 0 || lacking.length > 0) {
      comboRows.push({ id: v.id, ref: v.sku, name: productName(v.product.translations, v.product.slug), value: lacking.join(", ") || "—", href: productHref(v.product.id) });
    }
  }

  // Run có cước/kg đã áp dụng trước bản sửa: có thể đã cộng cước hai lần — liệt kê để người duyệt xem lại, không tự sửa.
  const fixedAt = fix[0]?.finished_at ?? null;
  const oldRuns = await prisma.priceUpdateRun.findMany({
    where: { status: "APPLIED", shipMmkPerKg: { not: null }, ...(fixedAt && { appliedAt: { lt: fixedAt } }) },
    orderBy: { appliedAt: "desc" },
    select: { id: true, appliedAt: true, shipMmkPerKg: true, location: { select: { name: true } }, _count: { select: { history: true } } },
  });

  // Lô dùng lại ở phiếu nhập (đã ghi sổ) thuộc chuyến khác với chuyến của lô → chi phí chuyến phân bổ sai chỗ.
  const mismatch = await prisma.$queryRaw<{ id: string; lotNo: string; sku: string; docCode: string }[]>`
    SELECT DISTINCT b."id", b."lotNo", v."sku", d."code" AS "docCode"
    FROM "StockDocumentLine" l
    JOIN "StockDocument" d ON d."id" = l."documentId"
    JOIN "Batch" b ON b."id" = l."batchId"
    JOIN "Variant" v ON v."id" = b."variantId"
    WHERE d."type" = 'RECEIVE' AND d."status" = 'POSTED' AND d."shipmentId" IS NOT NULL
      AND d."shipmentId" IS DISTINCT FROM b."shipmentId"
    ORDER BY v."sku", b."lotNo"`;

  return [
    check(
      "stockMissingCost",
      "error",
      [...missing.values()].sort((a, b) => b.qty - a.qty).map(({ qty, ...r }) => ({ ...r, value: String(qty) })),
    ),
    check(
      "draftOnlyCost",
      "warning",
      draftOnly.map((v) => ({ id: v.id, ref: v.sku, name: productName(v.product.translations, v.product.slug), href: productHref(v.product.id) })),
    ),
    check("comboMissingCost", "warning", comboRows),
    check(
      "oldShipRuns",
      "warning",
      oldRuns.map((r) => ({
        id: r.id,
        ref: r.appliedAt ? r.appliedAt.toISOString().slice(0, 10) : r.id,
        name: r.location?.name ?? undefined,
        value: String(r._count.history),
        href: `/admin/pricing/runs/${r.id}`,
      })),
    ),
    check(
      "lotShipmentMismatch",
      "warning",
      mismatch.map((m) => ({ id: `${m.id}:${m.docCode}`, ref: `${m.sku} · ${m.lotNo}`, value: m.docCode, href: `/admin/inventory/batches/${m.id}` })),
    ),
  ];
}

// ── Vận hành ───────────────────────────────────────────────────────────────

async function operationChecks(now: Date): Promise<HealthCheck[]> {
  const staleBefore = new Date(now.getTime() - STALE_DRAFT_DAYS * DAY_MS);
  const longBefore = new Date(now.getTime() - LONG_SHIPPING_DAYS * DAY_MS);
  const [overdue, shipping, cod, quarantine, drafts] = await Promise.all([
    prisma.order.findMany({
      where: { status: "PENDING", reservations: { some: { status: "ACTIVE", expiresAt: { lte: now } } } },
      orderBy: { createdAt: "asc" },
      select: { id: true, code: true, createdAt: true, paymentMethod: true },
    }),
    prisma.order.findMany({
      where: { status: "SHIPPING", deliveries: { some: { shippedAt: { lte: longBefore } } } },
      orderBy: { createdAt: "asc" },
      select: { id: true, code: true, deliveries: { orderBy: { createdAt: "desc" }, take: 1, select: { shippedAt: true, trackingNo: true } } },
    }),
    prisma.order.findMany({
      where: { paymentMethod: "COD", codCollectedAt: { not: null }, codRemittedAt: null },
      orderBy: { codCollectedAt: "asc" },
      select: { id: true, code: true, status: true, paymentStatus: true, codCollectedAt: true, items: { select: { returnedQty: true } } },
    }),
    prisma.stockBalance.findMany({
      where: { qty: { gt: 0 }, location: { type: "QUARANTINE" } },
      select: { qty: true, location: { select: { name: true } }, batch: { select: { id: true, lotNo: true, variant: { select: { sku: true } } } } },
    }),
    prisma.stockDocument.findMany({
      where: { status: "DRAFT", createdAt: { lte: staleBefore } },
      orderBy: { createdAt: "asc" },
      select: { id: true, code: true, type: true, createdAt: true },
    }),
  ]);
  // Ngoại lệ COD = hoàn tiền chưa đủ / có hoàn hàng → không đối soát thẳng được (xem orders/cod.ts).
  const codExceptions = cod.filter((o) => o.status !== "COMPLETED" || o.paymentStatus !== "PAID" || o.items.some((i) => i.returnedQty > 0));
  return [
    check(
      "overdueOrders",
      "warning",
      overdue.map((o) => ({ id: o.id, ref: o.code, name: o.paymentMethod, value: String(daysSince(o.createdAt, now)), href: `/admin/orders/${o.id}` })),
    ),
    check(
      "longShipping",
      "warning",
      shipping.map((o) => {
        const d = o.deliveries[0];
        return { id: o.id, ref: o.code, name: d?.trackingNo ?? undefined, value: d?.shippedAt ? String(daysSince(d.shippedAt, now)) : undefined, href: `/admin/orders/${o.id}` };
      }),
    ),
    check(
      "codExceptions",
      "warning",
      codExceptions.map((o) => ({ id: o.id, ref: o.code, value: String(daysSince(o.codCollectedAt!, now)), href: `/admin/orders/${o.id}` })),
    ),
    check(
      "quarantine",
      "info",
      quarantine.map((b) => ({
        id: `${b.batch.id}:${b.location.name}`,
        ref: `${b.batch.variant.sku} · ${b.batch.lotNo}`,
        name: b.location.name,
        value: String(b.qty),
        href: "/admin/inventory/quarantine",
      })),
    ),
    check(
      "staleDrafts",
      "info",
      drafts.map((d) => ({ id: d.id, ref: d.code, name: d.type, value: String(daysSince(d.createdAt, now)), href: `/admin/inventory/documents/${d.id}` })),
    ),
  ];
}

// ── Mốc vận hành (baseline) ────────────────────────────────────────────────

export type Percentiles = { n: number; p50: number | null; p90: number | null };
export type Baseline = {
  days: number;
  /** Giờ: tạo → xác nhận, xác nhận → bàn giao, tạo → bàn giao, bàn giao → hoàn tất (đơn tạo trong kỳ). */
  flow: { createdToConfirmed: Percentiles; confirmedToShipped: Percentiles; createdToShipped: Percentiles; shippedToCompleted: Percentiles };
  /** Giờ từ ghi sổ dòng nhập đến lần đổi giá kế tiếp của biến thể đó; `neverPriced` = chưa đổi giá lần nào sau nhập. */
  receiveToPrice: Percentiles & { neverPriced: number };
  ordersByStatus: { status: string; count: number }[];
  cod: { outstandingOrders: number; outstandingMmk: number; buckets: { label: string; orders: number; mmk: number }[] };
  commissionPaidMmk: number;
};

type PctRow = { n: bigint; p50: number | null; p90: number | null };
const pct = (r: PctRow | undefined): Percentiles => ({
  n: Number(r?.n ?? 0),
  p50: r?.p50 == null ? null : Math.round(Number(r.p50) * 10) / 10,
  p90: r?.p90 == null ? null : Math.round(Number(r.p90) * 10) / 10,
});
export async function baseline(now = new Date(), days = 30): Promise<Baseline> {
  const since = new Date(now.getTime() - days * DAY_MS);
  // Mốc đầu tiên của mỗi trạng thái theo đơn (OrderStatusHistory ghi mọi lần chuyển).
  const flowSql = prisma.$queryRaw<{ step: string; n: bigint; p50: number | null; p90: number | null }[]>`
    WITH firsts AS (
      SELECT o."id", o."createdAt",
        MIN(h."createdAt") FILTER (WHERE h."toStatus" IN ('COD_CONFIRMED', 'PAYMENT_CONFIRMED')) AS confirmed,
        MIN(h."createdAt") FILTER (WHERE h."toStatus" = 'SHIPPING') AS shipped,
        MIN(h."createdAt") FILTER (WHERE h."toStatus" = 'COMPLETED') AS completed
      FROM "Order" o JOIN "OrderStatusHistory" h ON h."orderId" = o."id"
      WHERE o."createdAt" >= ${since} AND o."createdAt" < ${now}
      GROUP BY o."id", o."createdAt"
    ), spans AS (
      SELECT 'createdToConfirmed' AS step, EXTRACT(EPOCH FROM confirmed - "createdAt") / 3600 AS h FROM firsts WHERE confirmed IS NOT NULL
      UNION ALL SELECT 'confirmedToShipped', EXTRACT(EPOCH FROM shipped - confirmed) / 3600 FROM firsts WHERE shipped IS NOT NULL AND confirmed IS NOT NULL
      UNION ALL SELECT 'createdToShipped', EXTRACT(EPOCH FROM shipped - "createdAt") / 3600 FROM firsts WHERE shipped IS NOT NULL
      UNION ALL SELECT 'shippedToCompleted', EXTRACT(EPOCH FROM completed - shipped) / 3600 FROM firsts WHERE completed IS NOT NULL AND shipped IS NOT NULL
    )
    SELECT step, COUNT(*) AS n,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY h)::float8 AS p50,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY h)::float8 AS p90
    FROM spans GROUP BY step`;
  const priceSql = prisma.$queryRaw<(PctRow & { never: bigint })[]>`
    WITH recv AS (
      SELECT l."variantId", d."postedAt",
        (SELECT MIN(ph."createdAt") FROM "PriceHistory" ph WHERE ph."variantId" = l."variantId" AND ph."createdAt" >= d."postedAt") AS priced
      FROM "StockDocumentLine" l JOIN "StockDocument" d ON d."id" = l."documentId"
      WHERE d."type" = 'RECEIVE' AND d."status" = 'POSTED' AND l."qty" > 0 AND d."postedAt" >= ${since} AND d."postedAt" < ${now}
    )
    SELECT COUNT(priced) AS n, COUNT(*) FILTER (WHERE priced IS NULL) AS never,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM priced - "postedAt") / 3600)::float8 AS p50,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM priced - "postedAt") / 3600)::float8 AS p90
    FROM recv`;
  const [flowRows, priceRows, byStatus, cod, paid] = await Promise.all([
    flowSql,
    priceSql,
    prisma.order.groupBy({ by: ["status"], _count: true, orderBy: { status: "asc" } }),
    prisma.order.findMany({
      where: { paymentMethod: "COD", codCollectedAt: { not: null }, codRemittedAt: null },
      select: { totalMmk: true, codCollectedAt: true },
    }),
    prisma.affiliatePayout.aggregate({ _sum: { amountMmk: true } }),
  ]);
  const flow = new Map(flowRows.map((r) => [r.step, r]));
  const buckets = COD_BUCKETS.map((b) => ({ label: b.label, orders: 0, mmk: 0 }));
  for (const o of cod) {
    const age = daysSince(o.codCollectedAt!, now);
    const i = COD_BUCKETS.findIndex((b) => age <= b.max);
    buckets[i].orders += 1;
    buckets[i].mmk += o.totalMmk;
  }
  return {
    days,
    flow: {
      createdToConfirmed: pct(flow.get("createdToConfirmed")),
      confirmedToShipped: pct(flow.get("confirmedToShipped")),
      createdToShipped: pct(flow.get("createdToShipped")),
      shippedToCompleted: pct(flow.get("shippedToCompleted")),
    },
    receiveToPrice: { ...pct(priceRows[0]), neverPriced: Number(priceRows[0]?.never ?? 0) },
    ordersByStatus: byStatus.map((r) => ({ status: r.status, count: r._count })),
    cod: { outstandingOrders: cod.length, outstandingMmk: cod.reduce((s, o) => s + o.totalMmk, 0), buckets },
    commissionPaidMmk: paid._sum.amountMmk ?? 0,
  };
}

export type DataHealth = {
  generatedAt: string;
  groups: { key: "catalog" | "cost" | "operations"; checks: HealthCheck[] }[];
  baseline: Baseline;
};

export async function dataHealth(now = new Date(), days = 30): Promise<DataHealth> {
  const [catalog, cost, operations, base] = await Promise.all([catalogChecks(), costChecks(), operationChecks(now), baseline(now, days)]);
  return {
    generatedAt: now.toISOString(),
    groups: [
      { key: "catalog", checks: catalog },
      { key: "cost", checks: cost },
      { key: "operations", checks: operations },
    ],
    baseline: base,
  };
}
