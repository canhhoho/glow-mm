import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createDocument, postDocument } from "@/server/inventory/documents";
import { estimateBatchCost } from "@/server/inventory/estimate";
import { inventoryCost } from "@/server/inventory/cost";
import { createRate } from "@/server/pricing/runs";
import { stockByLocation } from "@/server/reports/queries";
import { stockSummary } from "@/server/inventory/overview";
import { makeFixture } from "./fixtures";
import { createOrder } from "@/server/orders/orders";
import { transitionOrder } from "@/server/orders/transitions";
import { salesReport } from "@/server/reports/queries";
import { yangonDayKey } from "@/lib/time";
import { admin, orderInput, saleFixture } from "./fixtures";

describe("Estimated cost without a shipment", () => {
  it("keeps the estimated source on historical orders after the batch receives actual cost", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 300, qty: 5 }]);
    await prisma.batch.updateMany({ where: { variantId: f.variantId }, data: { landedCostMmk: null, estimatedCostMmk: 4500 } });
    const order = await createOrder(orderInput(f, 2), { userId: null });
    for (const step of ["confirmCod", "ship", "complete"] as const) {
      await transitionOrder(order.id, step, admin(f), { fromLocationId: f.mm.id, carrier: "T" });
    }
    const allocation = await prisma.orderAllocation.findFirstOrThrow({ where: { orderItem: { orderId: order.id } } });
    expect(allocation).toMatchObject({ unitLandedCostMmk: 4500, costStatus: "ESTIMATED" });
    await prisma.batch.update({ where: { id: allocation.batchId }, data: { landedCostMmk: 6000 } });
    const day = yangonDayKey(new Date());
    const report = await salesReport({ from: day, to: day }, { topN: 100000 });
    expect(report.estimatedCostOrders).toContain(order.code);
    expect(report.missingCostOrders).not.toContain(order.code);
    expect(report.topProducts.find((p) => p.sku === `IT-${f.tag}`)).toMatchObject({ profit: 11000 });
  });
  // 16/11/2026: ghi sổ không còn sinh giá vốn tạm (phí vận chuyển nằm trong giá bán; giá vốn = giá mua × tỷ giá).
  // `estimateBatchCost` (thủ công, tính năng chuyến hàng đang tắt) chỉ còn cho lô CŨ thiếu giá vốn thực tế.
  it("posting gives the lot an ACTUAL cost = purchase × rate and never an estimate", async () => {
    const f = await makeFixture();
    await createRate({ mmkPerUsd: "4420", vndPerUsd: "26000" }, f.userId);
    await prisma.variant.update({ where: { id: f.variantId }, data: { weightGrams: 80 } });
    const doc = await createDocument({ type: "RECEIVE", toId: f.mm.id, lines: [
      { variantId: f.variantId, lotNo: "EST", expiryDate: "2028-12-31", unitCostVnd: 100000, qty: 5 },
    ] }, f.userId);
    await postDocument(doc.id, f.userId);
    const batch = await prisma.batch.findUniqueOrThrow({ where: { variantId_lotNo: { variantId: f.variantId, lotNo: "EST" } } });
    expect(batch).toMatchObject({ landedCostMmk: 17000, landedCostVnd: null, estimatedCostMmk: null });
    expect(inventoryCost(batch)).toEqual({ unitCostMmk: 17000, costStatus: "ACTUAL" });
    expect((await stockByLocation()).find((r) => r.code === f.mm.code)).toMatchObject({ valueMmk: 85000, estimatedQty: 0, missingCost: 0 });
    expect(await stockSummary({ q: f.tag })).toMatchObject({ valueMmk: 85000, estimatedUnits: 0, unvaluedUnits: 0 });
  });

  it("manual estimate still works for an old lot without actual cost, and is refused once actual cost exists", async () => {
    const f = await makeFixture();
    await createRate({ mmkPerUsd: "4420", vndPerUsd: "26000" }, f.userId);
    await prisma.variant.update({ where: { id: f.variantId }, data: { weightGrams: 80 } });
    const doc = await createDocument({ type: "RECEIVE", toId: f.mm.id, lines: [
      { variantId: f.variantId, lotNo: "OLD", expiryDate: "2028-12-31", unitCostVnd: 100000, qty: 5 },
    ] }, f.userId);
    await postDocument(doc.id, f.userId);
    const batch = await prisma.batch.findUniqueOrThrow({ where: { variantId_lotNo: { variantId: f.variantId, lotNo: "OLD" } } });
    await prisma.batch.update({ where: { id: batch.id }, data: { landedCostMmk: null } }); // mô phỏng lô cũ thiếu giá vốn
    expect(inventoryCost(await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } })).costStatus).toBe("MISSING");
    await estimateBatchCost({ batchId: batch.id, shipMmkPerKg: 8000 }, f.userId);
    const estimated = await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(estimated).toMatchObject({ estimatedCostMmk: 17640, estimatedShipMmkPerKg: 8000, estimatedWeightGrams: 80 });
    expect(inventoryCost(estimated)).toEqual({ unitCostMmk: 17640, costStatus: "ESTIMATED" });
    await prisma.batch.update({ where: { id: batch.id }, data: { landedCostMmk: 19000 } });
    expect(inventoryCost(await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } }))).toEqual({ unitCostMmk: 19000, costStatus: "ACTUAL" });
    await expect(estimateBatchCost({ batchId: batch.id, shipMmkPerKg: 1 }, f.userId)).rejects.toThrow(/thực tế/);
  });

  it("does not invent a zero cost when weight is missing", async () => {
    const f = await makeFixture();
    await createRate({ mmkPerUsd: "4420", vndPerUsd: "26000" }, f.userId);
    const doc = await createDocument({ type: "RECEIVE", toId: f.mm.id, lines: [
      { variantId: f.variantId, lotNo: "NO-WEIGHT", expiryDate: "2028-12-31", unitCostVnd: 100000, qty: 1 },
    ] }, f.userId);
    await postDocument(doc.id, f.userId);
    const batch = await prisma.batch.findFirstOrThrow({ where: { variantId: f.variantId } });
    await prisma.batch.update({ where: { id: batch.id }, data: { landedCostMmk: null } });
    await expect(estimateBatchCost({ batchId: batch.id, shipMmkPerKg: 8000 }, f.userId)).rejects.toThrow(/khối lượng/);
  });
});
