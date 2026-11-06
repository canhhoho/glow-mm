import "server-only";
import { prisma } from "@/lib/db";
import { addDays, dayRange, yangonDayKey, yangonDayStart } from "@/lib/time";
import { loadVariantStock } from "@/server/alerts/queries";
import { salesBlockDays } from "@/server/inventory/documents";
import { bundleDefs } from "@/server/orders/availability";
import { getNumberSetting } from "@/server/settings";
import { commissionBaseMmk, commissionMmk, saleCommissionMmk } from "@/server/affiliates/commission";
import { itemProfit } from "./profit";
import { inventoryCost } from "@/server/inventory/cost";

/**
 * Báo cáo (đã chốt P3): doanh thu = tiền hàng của đơn HOÀN TẤT theo ngày hoàn tất (giờ Yangon),
 * trừ hàng khách đã trả; lợi nhuận = doanh thu − giá vốn lô đã xuất (trừ phần trả lại). Phí ship tách riêng.
 */

export type Range = { from: string; to: string };

/** Khoảng mặc định: 30 ngày gần nhất tính đến hôm nay (giờ Yangon). */
export function defaultRange(now = new Date(), days = 30): Range {
  const to = yangonDayKey(now);
  return { from: addDays(to, -(days - 1)), to };
}

export async function salesReport(range: Range, opts: { topN?: number } = {}) {
  const start = yangonDayStart(range.from);
  const end = yangonDayStart(addDays(range.to, 1));
  const completions = await prisma.orderStatusHistory.findMany({
    where: { toStatus: "COMPLETED", createdAt: { gte: start, lt: end } },
    select: { orderId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const completedAt = new Map<string, Date>();
  for (const c of completions) if (!completedAt.has(c.orderId)) completedAt.set(c.orderId, c.createdAt);

  const orders = await prisma.order.findMany({
    where: { id: { in: [...completedAt.keys()] } },
    include: {
      items: {
        include: {
          allocations: {
            orderBy: { id: "asc" },
            include: { batch: { select: { variantId: true } } },
          },
        },
      },
    },
  });
  const defs = await prisma.$transaction((tx) =>
    bundleDefs(tx, [...new Set(orders.flatMap((o) => o.items.map((i) => i.variantId)))]),
  );

  const days = new Map(
    dayRange(range.from, range.to).map((k) => [k, { day: k, orders: 0, revenue: 0, cogs: 0, profit: 0 }]),
  );
  const products = new Map<string, { sku: string; name: string; units: number; revenue: number; profit: number }>();
  const totals = { orders: 0, grossRevenue: 0, returnedRevenue: 0, revenue: 0, cogs: 0, profit: 0, shippingFees: 0, commission: 0, uplineCommission: 0, codCarrierFees: 0, unsettledCodOrders: 0, senderPaysOrders: 0 };
  const missingCostOrders: string[] = [];
  const estimatedCostOrders: string[] = [];

  for (const o of orders) {
    const day = days.get(yangonDayKey(completedAt.get(o.id)!));
    if (!day) continue;
    let missing = false;
    let estimated = false;
    for (const i of o.items) {
      const p = itemProfit({
        qty: i.qty,
        returnedQty: i.returnedQty,
        unitPriceMmk: i.unitPriceMmk,
        parts: (defs.get(i.variantId) ?? [{ componentId: i.variantId, qty: 1 }]).map((c) => ({
          variantId: c.componentId,
          qty: c.qty,
        })),
        allocations: i.allocations.map((a) => ({
          batchId: a.batchId,
          variantId: a.batch.variantId,
          qty: a.qty,
          unitCostMmk: a.unitLandedCostMmk,
          costStatus: a.costStatus,
        })),
      });
      missing ||= p.missingCost;
      estimated ||= p.estimatedCost;
      totals.grossRevenue += p.grossRevenue;
      totals.returnedRevenue += p.returnedRevenue;
      totals.revenue += p.netRevenue;
      totals.cogs += p.cogs;
      totals.profit += p.profit;
      day.revenue += p.netRevenue;
      day.cogs += p.cogs;
      day.profit += p.profit;
      const prod = products.get(i.sku) ?? { sku: i.sku, name: i.name, units: 0, revenue: 0, profit: 0 };
      prod.units += i.qty - i.returnedQty;
      prod.revenue += p.netRevenue;
      prod.profit += p.profit;
      products.set(i.sku, prod);
    }
    totals.orders++;
    totals.shippingFees += o.shippingFeeMmk;
    totals.codCarrierFees += o.codCarrierFeeMmk ?? 0;
    if (o.paymentMethod === "COD" && !o.codRemittedAt) totals.unsettledCodOrders++;
    if (o.shippingPayer === "SENDER") totals.senderPaysOrders++;
    // Hoa hồng CTV (P10) + tầng trên (P11) ghi nhận theo ngày hoàn tất, trên tiền hàng sau khi trừ hàng trả.
    const base = commissionBaseMmk(o.items);
    const upline = commissionMmk(base, o.uplineRateBp);
    totals.commission += saleCommissionMmk(o.items, o.commissionRateBp) + upline;
    totals.uplineCommission += upline;
    day.orders++;
    if (missing) missingCostOrders.push(o.code);
    if (estimated) estimatedCostOrders.push(o.code);
  }

  return {
    range,
    totals: {
      ...totals,
      profitAfterCommission: totals.profit - totals.commission,
      profitAfterRecordedCosts: totals.profit - totals.commission - totals.codCarrierFees,
      marginPct: totals.revenue > 0 ? Math.round((totals.profit / totals.revenue) * 1000) / 10 : null,
    },
    daily: [...days.values()],
    // Bỏ SP bị trả hết (bán ròng 0) — không phải "bán chạy".
    topProducts: [...products.values()]
      .filter((p) => p.units > 0)
      .sort((a, b) => b.units - a.units || b.revenue - a.revenue)
      .slice(0, opts.topN ?? 10),
    missingCostOrders,
    estimatedCostOrders,
  };
}

/** Còn hàng bán được nhưng không bán được cái nào trong N ngày gần nhất. */
export async function slowMovers(now = new Date()) {
  const [blockDays, salesWindowDays] = await Promise.all([salesBlockDays(), getNumberSetting("reorder.salesWindowDays")]);
  const stock = await loadVariantStock(now, { blockDays, salesWindowDays });
  return {
    days: salesWindowDays,
    items: stock.filter((v) => v.available > 0 && v.soldUnits === 0).sort((a, b) => b.available - a.available),
  };
}

/**
 * Tồn theo kho (P24; số lượng + giá trị theo landed cost MMK) — khớp tổng sổ cái.
 * Gồm kho đang dùng và kho đã ngừng nhưng còn tồn; thứ tự kho bán → chờ kiểm tra → kho cũ.
 */
export async function stockByLocation() {
  const [locations, rows] = await Promise.all([
    prisma.location.findMany({
      orderBy: [{ pricingMode: "asc" }, { code: "asc" }],
      select: { id: true, code: true, name: true, type: true, sellable: true, active: true },
    }),
    prisma.stockBalance.findMany({
      where: { qty: { not: 0 } },
      select: { qty: true, stockType: true, locationId: true, batch: { select: { landedCostMmk: true, estimatedCostMmk: true } } },
    }),
  ]);
  const out = new Map<string, { qty: number; testerQty: number; valueMmk: number; missingCost: number; estimatedQty: number }>();
  for (const r of rows) {
    const cur = out.get(r.locationId) ?? { qty: 0, testerQty: 0, valueMmk: 0, missingCost: 0, estimatedQty: 0 };
    if (r.stockType === "TESTER") cur.testerQty += r.qty;
    else cur.qty += r.qty;
    const cost = inventoryCost(r.batch);
    if (cost.unitCostMmk == null) cur.missingCost += r.qty;
    else cur.valueMmk += r.qty * cost.unitCostMmk;
    if (cost.costStatus === "ESTIMATED") cur.estimatedQty += r.qty;
    out.set(r.locationId, cur);
  }
  const rank = (l: { sellable: boolean; type: string }) => (l.sellable ? 0 : l.type === "QUARANTINE" ? 1 : 2);
  const zero = () => ({ qty: 0, testerQty: 0, valueMmk: 0, missingCost: 0, estimatedQty: 0 });
  const rowsOut: { code: string | null; name: string | null; type: string | null; active: boolean; qty: number; testerQty: number; valueMmk: number; missingCost: number; estimatedQty: number }[] = locations
    .filter((l) => l.active)
    .sort((a, b) => rank(a) - rank(b))
    .map((l) => ({ code: l.code, name: l.name, type: l.type, active: true, ...(out.get(l.id) ?? zero()) }));
  // Kho đã ngừng dùng nhưng còn tồn → gộp một dòng (code null) để bảng không dài theo số kho cũ.
  const inactive = locations.filter((l) => !l.active && out.has(l.id));
  if (inactive.length) {
    const sum = zero();
    for (const l of inactive) {
      const s = out.get(l.id)!;
      sum.qty += s.qty;
      sum.testerQty += s.testerQty;
      sum.valueMmk += s.valueMmk;
      sum.missingCost += s.missingCost;
      sum.estimatedQty += s.estimatedQty;
    }
    rowsOut.push({ code: null, name: null, type: null, active: false, ...sum });
  }
  return rowsOut;
}

/** Chuyến hàng đã đi, chưa đến. */
export async function inboundShipments() {
  const shipments = await prisma.inboundShipment.findMany({
    where: { departedAt: { not: null }, arrivedAt: null },
    orderBy: { departedAt: "asc" },
    include: { _count: { select: { batches: true } }, costs: { select: { amountVnd: true } } },
  });
  return shipments.map((s) => ({
    id: s.id,
    code: s.code,
    departedAt: s.departedAt!,
    batches: s._count.batches,
    costsVnd: s.costs.reduce((a, c) => a + c.amountVnd, 0),
  }));
}

/** Việc cần làm cho nhân viên (dashboard). */
export async function workQueue(now = new Date()) {
  const [byStatus, overdue, longShipping] = await Promise.all([
    prisma.order.groupBy({
      by: ["status", "paymentMethod"],
      where: { status: { in: ["PENDING", "PAYMENT_CONFIRMED", "COD_CONFIRMED", "PACKING", "SHIPPING"] } },
      _count: true,
    }),
    prisma.order.count({
      where: { status: "PENDING", reservations: { some: { status: "ACTIVE", expiresAt: { lte: now } } } },
    }),
    prisma.order.count({ where: { status: "SHIPPING", deliveries: { some: { shippedAt: { lte: new Date(now.getTime() - 7 * 86400000) } } } } }),
  ]);
  const count = (pred: (r: (typeof byStatus)[number]) => boolean) =>
    byStatus.filter(pred).reduce((s, r) => s + r._count, 0);
  return {
    codToConfirm: count((r) => r.status === "PENDING" && r.paymentMethod === "COD"),
    bankToConfirm: count((r) => r.status === "PENDING" && r.paymentMethod === "BANK_TRANSFER"),
    preparing: count((r) => r.status === "PAYMENT_CONFIRMED" || r.status === "COD_CONFIRMED" || r.status === "PACKING"),
    shipping: count((r) => r.status === "SHIPPING"),
    overdue,
    longShipping,
  };
}
