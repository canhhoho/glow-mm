import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { addDays, yangonDayKey, yangonDayStart } from "@/lib/time";
import { createOrder } from "@/server/orders/orders";
import { returnItems } from "@/server/orders/returns";
import { transitionOrder } from "@/server/orders/transitions";
import { createShipment, markShipmentArrived } from "@/server/inventory/shipments";
import { inboundShipments, salesReport, stockByLocationType } from "@/server/reports/queries";
import { admin, orderInput, saleFixture, unpublishTestProducts } from "./fixtures";

afterAll(unpublishTestProducts);

/**
 * "Số liệu dashboard khớp ledger": tính lại độc lập từ sổ cái (StockLedger) + dòng đơn rồi so với báo cáo.
 * Chạy trên toàn DB test (gồm dữ liệu seed nếu có) trong 30 ngày gần nhất.
 */
async function ledgerTotals(from: string, to: string) {
  const completed = await prisma.orderStatusHistory.findMany({
    where: { toStatus: "COMPLETED", createdAt: { gte: yangonDayStart(from), lt: yangonDayStart(addDays(to, 1)) } },
    select: { orderId: true },
  });
  const ids = [...new Set(completed.map((c) => c.orderId))];
  const items = await prisma.orderItem.findMany({ where: { orderId: { in: ids } } });
  const revenue = items.reduce((s, i) => s + (i.qty - i.returnedQty) * i.unitPriceMmk, 0);
  // Số lượng lấy từ SỔ CÁI (phiếu xuất/nhận trả gắn đơn); đơn giá vốn = giá chụp lúc đóng gói (OrderAllocation),
  // vì lô có thể được phân bổ landed cost sau khi đã bán.
  const ledger = await prisma.stockLedger.findMany({
    where: { document: { orderId: { in: ids }, type: { in: ["ISSUE", "RETURN"] } } },
    select: { qtyDelta: true, batchId: true, document: { select: { orderId: true } } },
  });
  const allocs = await prisma.orderAllocation.findMany({
    where: { orderItem: { orderId: { in: ids } } },
    select: { batchId: true, unitLandedCostMmk: true, orderItem: { select: { orderId: true } } },
  });
  const unitCost = new Map(allocs.map((a) => [`${a.orderItem.orderId}|${a.batchId}`, a.unitLandedCostMmk]));
  // Xuất cho đơn: qtyDelta âm; hàng trả: dương → giá vốn = −Σ qtyDelta × giá vốn lô của đơn đó.
  const cogs = -ledger.reduce((s, l) => s + l.qtyDelta * (unitCost.get(`${l.document.orderId}|${l.batchId}`) ?? 0), 0);
  return { orders: ids.length, revenue, cogs };
}

describe("Báo cáo khớp sổ kho", () => {
  it("doanh thu / giá vốn / số đơn = tính lại từ ledger; tồn theo loại vị trí = tổng ledger", async () => {
    const f = await saleFixture([
      { lot: "A", expiryInDays: 300, qty: 3 },
      { lot: "B", expiryInDays: 600, qty: 10 },
    ]);
    await prisma.batch.updateMany({ where: { variantId: f.variantId, lotNo: "A" }, data: { landedCostMmk: 4_000 } });
    await prisma.batch.updateMany({ where: { variantId: f.variantId, lotNo: "B" }, data: { landedCostMmk: 6_000 } });

    const order = await createOrder(orderInput(f, 5), { userId: null });
    for (const step of ["confirmCod", "ship", "complete"] as const) {
      await transitionOrder(order.id, step, admin(f), { fromLocationId: f.mm.id, carrier: "T" });
    }
    const [item] = await prisma.orderItem.findMany({ where: { orderId: order.id } });
    await returnItems(order.id, { toLocationId: f.qc.id, lines: [{ orderItemId: item.id, qty: 1 }], reason: "x" }, admin(f));

    const to = yangonDayKey(new Date());
    const from = addDays(to, -29);
    const report = await salesReport({ from, to }, { topN: 100_000 });
    const expected = await ledgerTotals(from, to);
    expect(report.totals.orders).toBe(expected.orders);
    expect(report.totals.revenue).toBe(expected.revenue);
    expect(report.totals.cogs).toBe(expected.cogs);
    expect(report.totals.profit).toBe(expected.revenue - expected.cogs);
    expect(report.daily.reduce((s, d) => s + d.revenue, 0)).toBe(report.totals.revenue);

    // Đơn của fixture: 5 × 10,000 − 1 trả = 40,000; giá vốn A3×4,000 + B2×6,000 − trả 1×4,000 = 20,000.
    const mine = report.topProducts.find((p) => p.sku === `IT-${f.tag}`);
    expect(mine).toMatchObject({ units: 4, revenue: 40_000, profit: 20_000 });
    expect(report.topProducts.every((p) => p.units > 0)).toBe(true); // SP trả hết không vào "Bán chạy"

    const stock = await stockByLocationType();
    const ledgerByType = await prisma.$queryRaw<{ type: string; qty: bigint }[]>`
      SELECT l."type"::text AS type, COALESCE(SUM(sl."qtyDelta"), 0) AS qty
      FROM "StockLedger" sl JOIN "Location" l ON l.id = sl."locationId"
      WHERE sl."stockType" = 'SELLABLE'
      GROUP BY l."type"`;
    for (const s of stock) {
      expect(s.qty).toBe(Number(ledgerByType.find((r) => r.type === s.type)?.qty ?? 0));
    }
  });

  it("chuyến đã đi chưa đến → đang vận chuyển; đánh dấu đã đến thì hết", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 300, qty: 1 }]);
    const s = await createShipment({ code: `IT-${f.tag}`, departedAt: "2026-10-01" });
    expect((await inboundShipments()).some((x) => x.id === s.id)).toBe(true);
    await markShipmentArrived(s.id, f.userId);
    expect((await inboundShipments()).some((x) => x.id === s.id)).toBe(false);
    await expect(markShipmentArrived(s.id, f.userId)).rejects.toThrow(/đã đến/);
  });
});
