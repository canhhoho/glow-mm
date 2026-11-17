import "server-only";
import { variantDisplayName } from "@/lib/variant-label";
import { prisma } from "@/lib/db";
import { productName } from "@/server/inventory/queries";
import { baseAvailability } from "@/server/orders/availability";
import { getNumberSetting } from "@/server/settings";
import { FEATURES } from "@/lib/features";
import { classifyExpiry, lowStock, reorderList, type ExpiryLevel, type VariantStock } from "./compute";

const DAY_MS = 86_400_000;

/** Tồn theo biến thể (không gồm combo — combo trừ kho thành phần) + số đã bán trong cửa sổ. */
export async function loadVariantStock(now: Date, opts: { blockDays: number; salesWindowDays: number }) {
  const variants = await prisma.variant.findMany({
    where: { active: true, isBundle: false, product: { archivedAt: null } }, // SP ngừng kinh doanh: không báo tồn thấp / gợi ý đặt
    include: { product: { include: { translations: true } } },
    orderBy: { sku: "asc" },
  });
  const ids = variants.map((v) => v.id);
  const homeOf = new Map(variants.map((v) => [v.id, v.product.stockLocationId]));
  const since = new Date(now.getTime() - opts.salesWindowDays * DAY_MS);

  const [available, balances, issued, returned] = await Promise.all([
    // Chỉ đọc; READ COMMITTED cũ cũng không có snapshot xuyên hai câu SELECT.
    // Không giữ interactive transaction 5s: DB bận không được làm dashboard lỗi P2028.
    baseAvailability(prisma, ids, { now, blockDays: opts.blockDays }),
    // Tồn SELLABLE ngoài kho bán của SP và ngoài khu chờ kiểm tra — chỉ để xem ("Tồn ở vị trí khác").
    prisma.stockBalance.findMany({
      where: { qty: { gt: 0 }, stockType: "SELLABLE", location: { type: { not: "QUARANTINE" } }, batch: { variantId: { in: ids } } },
      select: { qty: true, locationId: true, batch: { select: { variantId: true } } },
    }),
    // Đã bán = xuất cho đơn (phiếu ISSUE gắn đơn) − hàng khách trả (phiếu RETURN gắn đơn), trong cửa sổ.
    prisma.stockLedger.findMany({
      where: { createdAt: { gte: since }, document: { type: "ISSUE", orderId: { not: null } } },
      select: { qtyDelta: true, batch: { select: { variantId: true } } },
    }),
    prisma.stockLedger.findMany({
      where: { createdAt: { gte: since }, document: { type: "RETURN", orderId: { not: null } } },
      select: { qtyDelta: true, batch: { select: { variantId: true } } },
    }),
  ]);

  const other = new Map<string, number>();
  for (const b of balances) {
    if (b.locationId === homeOf.get(b.batch.variantId)) continue; // kho bán của SP đã nằm trong `available`
    other.set(b.batch.variantId, (other.get(b.batch.variantId) ?? 0) + b.qty);
  }
  const sold = new Map<string, number>();
  for (const l of issued) sold.set(l.batch.variantId, (sold.get(l.batch.variantId) ?? 0) - l.qtyDelta);
  for (const l of returned) sold.set(l.batch.variantId, (sold.get(l.batch.variantId) ?? 0) - l.qtyDelta);

  return variants.map(
    (v): VariantStock => ({
      variantId: v.id,
      sku: v.sku,
      name: variantDisplayName(productName(v.product.translations, v.product.slug), v.label),
      lowStockAt: v.lowStockAt,
      safetyStock: v.safetyStock,
      leadTimeDays: v.leadTimeDays,
      available: Math.max(0, available.get(v.id) ?? 0),
      otherQty: other.get(v.id) ?? 0,
      soldUnits: Math.max(0, sold.get(v.id) ?? 0),
    }),
  );
}

export type ExpiryAlert = {
  batchId: string;
  sku: string;
  name: string;
  lotNo: string;
  expiryDate: Date | null;
  location: string;
  locationName: string;
  locationActive: boolean;
  stockType: "SELLABLE" | "TESTER";
  qty: number;
  level: ExpiryLevel;
};

/** Lô còn tồn ở bất kỳ vị trí nào mà đã hết hạn / bị khoá bán / cận date. */
export async function loadExpiryAlerts(now: Date, t: { blockDays: number; warnDays: number }): Promise<ExpiryAlert[]> {
  if (!FEATURES.expiry) return [];
  const rows = await prisma.stockBalance.findMany({
    where: { qty: { gt: 0 } },
    include: {
      location: { select: { code: true, name: true, active: true } },
      batch: { include: { variant: { include: { product: { include: { translations: true } } } } } },
    },
    orderBy: { batch: { expiryDate: "asc" } },
  });
  return rows.flatMap((r) => {
    const level = classifyExpiry(r.batch.expiryDate, now, t, r.batch.expiryStatus);
    if (!level) return [];
    return [
      {
        batchId: r.batchId,
        sku: r.batch.variant.sku,
        name: variantDisplayName(productName(r.batch.variant.product.translations, r.batch.variant.product.slug), r.batch.variant.label),
        lotNo: r.batch.lotNo,
        expiryDate: r.batch.expiryDate,
        location: r.location.code,
        locationName: r.location.name,
        locationActive: r.location.active,
        stockType: r.stockType,
        qty: r.qty,
        level,
      },
    ];
  });
}

/** Toàn bộ cảnh báo (trang /admin/alerts, dashboard, cron). */
export async function computeAlerts(now = new Date()) {
  const [blockDays, warnDays, salesWindowDays, coverDays] = await Promise.all([
    getNumberSetting("expiry.blockDays"),
    getNumberSetting("expiry.warnDays"),
    getNumberSetting("reorder.salesWindowDays"),
    getNumberSetting("reorder.coverDays"),
  ]);
  const [stock, expiry] = await Promise.all([
    loadVariantStock(now, { blockDays, salesWindowDays }),
    loadExpiryAlerts(now, { blockDays, warnDays }),
  ]);
  const low = lowStock(stock);
  const reorder = reorderList(stock, { salesWindowDays, coverDays });
  return {
    settings: { blockDays, warnDays, salesWindowDays, coverDays },
    lowStock: low,
    expiry,
    reorder,
    counts: {
      lowStock: low.length,
      expired: expiry.filter((e) => e.level === "expired").length,
      blocked: expiry.filter((e) => e.level === "blocked").length,
      near: expiry.filter((e) => e.level === "near").length,
      unknown: expiry.filter((e) => e.level === "unknown").length,
      reorder: reorder.length,
    },
  };
}

/** Cron: tính cảnh báo và ghi tóm tắt vào AuditLog (thông báo Telegram/Viber nằm ngoài phạm vi hiện tại). */
export async function runComputeAlerts(now = new Date()) {
  const { counts } = await computeAlerts(now);
  await prisma.auditLog.create({ data: { action: "alerts.compute", entity: "Alerts", data: counts } });
  return counts;
}
