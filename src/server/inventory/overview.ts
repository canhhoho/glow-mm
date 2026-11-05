import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { normalizeForSearch, toUnicode } from "@/lib/myanmar";
import { availableToSell } from "@/server/orders/availability";
import { getNumberSetting } from "@/server/settings";
import { sellableCutoff } from "./fefo";
import { productName } from "./queries";
import {
  LOCATION_TYPES,
  stockByVariantCols,
  summarizeStock,
  type BalanceRow,
  type Thresholds,
  type VariantStockCols,
} from "./stock-summary";

/**
 * Dữ liệu trang Tồn kho (P9b). Chỉ đọc `StockBalance` / `Batch` / `Reservation` / `StockLedger`;
 * phần tính toán thuần nằm ở `stock-summary.ts`.
 */

export const PAGE_SIZE = 25;
/** Tab = "all" hoặc mã kho (P24). Giá trị loại vị trí cũ (MM_STOCK, …) vẫn nhận → lọc theo loại. */
const isLocationType = (tab: string): tab is (typeof LOCATION_TYPES)[number] => (LOCATION_TYPES as readonly string[]).includes(tab);
/** near = cận hạn; blocked = ngừng bán (gồm hết hạn); expired = đã hết hạn. */
export const EXPIRY_FILTERS = ["near", "blocked", "expired", "unknown", "none"] as const;
export type ExpiryFilter = (typeof EXPIRY_FILTERS)[number];

/** Bộ lọc lấy từ URL; giá trị lạ → mặc định (không báo lỗi). */
export const stockFilterSchema = z.object({
  tab: z.string().regex(/^[A-Za-z0-9_-]{1,20}$/).catch("all"),
  q: z
    .string()
    .trim()
    .max(100)
    .transform((s) => (s ? toUnicode(s) : undefined))
    .optional()
    .catch(undefined),
  expiry: z.enum(EXPIRY_FILTERS).optional().catch(undefined),
  stockType: z.enum(["SELLABLE", "TESTER"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1),
});
export type StockFilter = z.infer<typeof stockFilterSchema>;

export function parseStockFilter(sp: Record<string, string | string[] | undefined>): StockFilter {
  const one = (k: string) => (typeof sp[k] === "string" ? sp[k] : undefined);
  return stockFilterSchema.parse({
    tab: one("tab") ?? "all",
    q: one("q"),
    expiry: one("expiry"),
    stockType: one("stockType"),
    page: one("page") ?? 1,
  });
}

export async function loadThresholds(): Promise<Thresholds> {
  const [blockDays, warnDays] = await Promise.all([getNumberSetting("expiry.blockDays"), getNumberSetting("expiry.warnDays")]);
  return { blockDays, warnDays };
}

const contains = (q: string) => ({ contains: q, mode: "insensitive" as const });
const productSearch = (q: string): Prisma.ProductWhereInput => ({
  translations: { some: { OR: [{ name: contains(q) }, { searchText: contains(normalizeForSearch(q)) }] } },
});

/** Lô khớp từ khoá: số lô, SKU hoặc tên sản phẩm. */
function batchSearch(q: string): Prisma.BatchWhereInput {
  return { OR: [{ lotNo: contains(q) }, { variant: { sku: contains(q) } }, { variant: { product: productSearch(q) } }] };
}

function expiryWhere(e: ExpiryFilter | undefined, now: Date, t: Thresholds): Prisma.BatchWhereInput {
  if (e === "unknown") return { expiryStatus: "UNKNOWN" };
  if (e === "none") return { expiryStatus: "NONE" };
  if (e === "near") return { expiryStatus: "DATED", expiryDate: { gte: sellableCutoff(now, t.blockDays), lt: sellableCutoff(now, t.warnDays) } };
  if (e === "blocked") return { OR: [{ expiryStatus: "UNKNOWN" }, { expiryDate: { lt: sellableCutoff(now, t.blockDays) } }] };
  if (e === "expired") return { expiryDate: { lt: sellableCutoff(now, 0) } };
  return {};
}

/** Điều kiện dòng tồn theo bộ lọc (tab vị trí, hạn dùng, loại tồn, từ khoá). */
function balanceWhere(f: StockFilter, now: Date, t: Thresholds): Prisma.StockBalanceWhereInput {
  return {
    qty: { not: 0 },
    stockType: f.stockType,
    location: f.tab === "all" ? undefined : isLocationType(f.tab) ? { type: f.tab } : { code: f.tab },
    batch: { AND: [expiryWhere(f.expiry, now, t), f.q ? batchSearch(f.q) : {}] },
  };
}

const ROW_INCLUDE = {
  location: { select: { code: true, name: true, type: true, sellable: true } },
  batch: { select: { variantId: true, lotNo: true, expiryDate: true, expiryStatus: true, landedCostMmk: true } },
} satisfies Prisma.StockBalanceInclude;

async function loadRows(where: Prisma.StockBalanceWhereInput): Promise<BalanceRow[]> {
  const rows = await prisma.stockBalance.findMany({ where: { qty: { not: 0 }, ...where }, include: ROW_INCLUDE });
  return rows.map((r) => ({
    variantId: r.batch.variantId,
    batchId: r.batchId,
    lotNo: r.batch.lotNo,
    expiryDate: r.batch.expiryDate,
    expiryStatus: r.batch.expiryStatus,
    landedCostMmk: r.batch.landedCostMmk,
    locationId: r.locationId,
    locationCode: r.location.code,
    locationName: r.location.name,
    locationType: r.location.type,
    sellable: r.location.sellable,
    stockType: r.stockType,
    qty: r.qty,
  }));
}

/** Ô số tổng + SL theo loại vị trí (cho tab). `q` chỉ dùng để giới hạn phạm vi (vd. test). */
export async function stockSummary(opts: { q?: string; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const t = await loadThresholds();
  const rows = await loadRows(opts.q ? { batch: batchSearch(opts.q) } : {});
  const positive = rows.filter((r) => r.qty > 0);
  // Hàng đơn chưa đóng gói đang giữ (cùng điều kiện cột "Đang giữ") → ô "Bán được" hiện số còn bán thật.
  const held = await prisma.reservation.aggregate({
    where: {
      status: "ACTIVE",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      ...(opts.q ? { variantId: { in: [...new Set(positive.map((r) => r.variantId))] } } : {}),
    },
    _sum: { qty: true },
  });
  return {
    ...summarizeStock(rows, now, t),
    heldUnits: held._sum.qty ?? 0,
    variants: new Set(positive.map((r) => r.variantId)).size,
    lots: new Set(positive.map((r) => r.batchId)).size,
    thresholds: t,
  };
}

/**
 * Tab + cột theo kho (P24): kho đang dùng và kho đã ngừng nhưng còn tồn.
 * Thứ tự: kho bán → khu chờ kiểm tra → kho cũ.
 */
export async function stockTabs() {
  const [locations, stocked] = await Promise.all([
    prisma.location.findMany({
      orderBy: [{ pricingMode: "asc" }, { code: "asc" }], // cùng thứ tự ô chọn kho: Kho Thắm (VN_IMPORT) trước
      select: { id: true, code: true, name: true, type: true, sellable: true, active: true },
    }),
    prisma.stockBalance.groupBy({ by: ["locationId"], where: { qty: { not: 0 } } }),
  ]);
  const has = new Set(stocked.map((s) => s.locationId));
  const rank = (l: { sellable: boolean; type: string }) => (l.sellable ? 0 : l.type === "QUARANTINE" ? 1 : 2);
  return locations.filter((l) => l.active || has.has(l.id)).sort((a, b) => rank(a) - rank(b)); // sort ổn định giữ thứ tự DB
}
export type StockTab = Awaited<ReturnType<typeof stockTabs>>[number];

type Page<T> = { rows: T[]; total: number; page: number; pageCount: number };
const pageOf = <T>(rows: T[], total: number, page: number): Page<T> => ({
  rows,
  total,
  page,
  pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
});

export type VariantStockRow = {
  variantId: string;
  productId: string;
  sku: string;
  label: string;
  name: string;
  imageUrl: string | null;
  isBundle: boolean;
  active: boolean;
  /** null = không có dòng tồn nào (hết hàng hoặc combo). */
  cols: VariantStockCols | null;
  lotCount: number;
  /** Đang giữ cho đơn (giữ hàng ACTIVE chưa hết hạn). */
  reserved: number;
  /** Còn bán — cùng công thức storefront (`availableToSell`); combo = số bộ ghép được. */
  available: number;
};

/**
 * Bảng "Theo sản phẩm": phân trang biến thể ở DB rồi nạp tồn của trang.
 * Tab "Tất cả" không lọc → mọi biến thể đang bán + biến thể ngừng bán còn tồn (gồm hết hàng, combo).
 * Có lọc (tab / hạn dùng / loại tồn) → chỉ biến thể có dòng tồn khớp.
 */
export async function stockByVariant(f: StockFilter, now = new Date()): Promise<Page<VariantStockRow>> {
  const t = await loadThresholds();
  const filtered = f.tab !== "all" || !!f.expiry || !!f.stockType;
  const where: Prisma.VariantWhereInput = filtered
    ? { batches: { some: { balances: { some: balanceWhere(f, now, t) } } } }
    : {
        AND: [
          { OR: [{ active: true }, { batches: { some: { balances: { some: { qty: { not: 0 } } } } } }] },
          f.q
            ? { OR: [{ sku: contains(f.q) }, { product: productSearch(f.q) }, { batches: { some: { lotNo: contains(f.q) } } }] }
            : {},
        ],
      };

  const [total, variants] = await Promise.all([
    prisma.variant.count({ where }),
    prisma.variant.findMany({
      where,
      orderBy: { sku: "asc" },
      skip: (f.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        product: {
          select: {
            slug: true,
            translations: { select: { locale: true, name: true } },
            images: { orderBy: { sortOrder: "asc" }, take: 1, select: { file: { select: { url: true } } } },
          },
        },
      },
    }),
  ]);
  const ids = variants.map((v) => v.id);
  if (ids.length === 0) return pageOf([], total, f.page);

  const [rows, available, held] = await Promise.all([
    loadRows({ batch: { variantId: { in: ids } } }),
    prisma.$transaction((tx) => availableToSell(tx, ids, { now, blockDays: t.blockDays })),
    prisma.reservation.groupBy({
      by: ["variantId"],
      where: { variantId: { in: ids }, status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      _sum: { qty: true },
    }),
  ]);
  const cols = stockByVariantCols(rows);
  const reserved = new Map(held.map((h) => [h.variantId, h._sum.qty ?? 0]));

  return pageOf(
    variants.map((v) => {
      const c = cols.get(v.id) ?? null;
      return {
        variantId: v.id,
        productId: v.productId,
        sku: v.sku,
        label: v.label,
        name: productName(v.product.translations, v.product.slug),
        imageUrl: v.product.images[0]?.file.url ?? null,
        isBundle: v.isBundle,
        active: v.active,
        cols: c,
        lotCount: c ? new Set(c.lots.filter((l) => l.qty > 0).map((l) => l.batchId)).size : 0,
        reserved: reserved.get(v.id) ?? 0,
        available: available.get(v.id) ?? 0,
      };
    }),
    total,
    f.page,
  );
}

/** Bảng "Theo lô" (lô × vị trí × loại tồn) theo bộ lọc, phân trang. */
export async function stockLots(f: StockFilter, now = new Date()) {
  const t = await loadThresholds();
  const where = balanceWhere(f, now, t);
  const [total, rows] = await Promise.all([
    prisma.stockBalance.count({ where }),
    prisma.stockBalance.findMany({
      where,
      include: {
        location: { select: { code: true, name: true, type: true } },
        batch: { include: { variant: { include: { product: { include: { translations: true } } } } } },
      },
      orderBy: [{ batch: { variant: { sku: "asc" } } }, { batch: { expiryDate: "asc" } }, { location: { code: "asc" } }],
      skip: (f.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return pageOf(
    rows.map((r) => ({
      key: `${r.batchId}|${r.locationId}|${r.stockType}`,
      batchId: r.batchId,
      variantId: r.batch.variantId,
      sku: r.batch.variant.sku,
      name: productName(r.batch.variant.product.translations, r.batch.variant.product.slug),
      variantLabel: r.batch.variant.label,
      lotNo: r.batch.lotNo,
      expiryDate: r.batch.expiryDate,
    expiryStatus: r.batch.expiryStatus,
      locationCode: r.location.code,
      locationName: r.location.name,
      locationType: r.location.type,
      stockType: r.stockType,
      qty: r.qty,
      landedCostMmk: r.batch.landedCostMmk,
    })),
    total,
    f.page,
  );
}

/** Trang lịch sử lô: thông tin lô, tồn hiện tại theo vị trí, các dòng ledger kèm tồn luỹ kế (mọi vị trí). */
export async function batchDetail(batchId: string) {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: {
      variant: { include: { product: { include: { translations: true } } } },
      shipment: true,
      rate: true,
      balances: { where: { qty: { not: 0 } }, include: { location: true }, orderBy: { location: { code: "asc" } } },
    },
  });
  if (!batch) return null;
  const ledger = await prisma.stockLedger.findMany({
    where: { batchId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: {
      location: { select: { code: true, type: true } },
      document: { select: { id: true, code: true, type: true, reason: true, order: { select: { id: true, code: true } } } },
    },
  });
  let running = 0;
  return {
    batch,
    name: productName(batch.variant.product.translations, batch.variant.product.slug),
    entries: ledger.map((l) => ({ ...l, balanceAfter: (running += l.qtyDelta) })),
    total: running,
  };
}
