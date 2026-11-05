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
  it("snapshots purchase + freight on posting, includes it in stock valuation, and preserves the snapshot", async () => {
    const f = await makeFixture();
    await createRate({ mmkPerUsd: "4420", vndPerUsd: "26000" }, f.userId);
    await prisma.variant.update({ where: { id: f.variantId }, data: { weightGrams: 80 } });
    const doc = await createDocument({ type: "RECEIVE", toId: f.mm.id, estimatedShipMmkPerKg: 8000, lines: [
      { variantId: f.variantId, lotNo: "EST", expiryDate: "2028-12-31", unitCostVnd: 100000, qty: 5 },
    ] }, f.userId);
    let batch = await prisma.batch.findUniqueOrThrow({ where: { variantId_lotNo: { variantId: f.variantId, lotNo: "EST" } } });
    expect(batch.estimatedCostMmk).toBeNull();
    await postDocument(doc.id, f.userId);
    batch = await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(batch).toMatchObject({ landedCostMmk: null, estimatedCostMmk: 17640, estimatedShipMmkPerKg: 8000, estimatedWeightGrams: 80 });
    expect((await stockByLocation()).find((r) => r.code === f.mm.code)).toMatchObject({ valueMmk: 88200, estimatedQty: 5, missingCost: 0 });
    expect(await stockSummary({ q: f.tag })).toMatchObject({ valueMmk: 88200, estimatedUnits: 5, unvaluedUnits: 0 });
    await prisma.variant.update({ where: { id: f.variantId }, data: { weightGrams: 100 } });
    expect((await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } })).estimatedCostMmk).toBe(17640);
    await estimateBatchCost({ batchId: batch.id, shipMmkPerKg: 8000 }, f.userId);
    expect((await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } })).estimatedCostMmk).toBe(17800);
    await prisma.batch.update({ where: { id: batch.id }, data: { landedCostMmk: 19000 } });
    expect(inventoryCost(await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } }))).toEqual({ unitCostMmk: 19000, costStatus: "ACTUAL" });
    await expect(estimateBatchCost({ batchId: batch.id, shipMmkPerKg: 1 }, f.userId)).rejects.toThrow(/thực tế/);
  });

  it("does not invent a zero cost when freight or weight is missing", async () => {
    const f = await makeFixture();
    await createRate({ mmkPerUsd: "4420", vndPerUsd: "26000" }, f.userId);
    for (const [lotNo, freight] of [["NO-FREIGHT", undefined], ["NO-WEIGHT", 8000]] as const) {
      const doc = await createDocument({ type: "RECEIVE", toId: f.mm.id, estimatedShipMmkPerKg: freight, lines: [
        { variantId: f.variantId, lotNo, expiryDate: "2028-12-31", unitCostVnd: 100000, qty: 1 },
      ] }, f.userId);
      await postDocument(doc.id, f.userId);
    }
    expect(await prisma.batch.findMany({ where: { variantId: f.variantId }, select: { landedCostMmk: true, estimatedCostMmk: true } })).toEqual([
      { landedCostMmk: null, estimatedCostMmk: null }, { landedCostMmk: null, estimatedCostMmk: null },
    ]);
    const batch = await prisma.batch.findFirstOrThrow({ where: { variantId: f.variantId } });
    await expect(estimateBatchCost({ batchId: batch.id, shipMmkPerKg: 8000 }, f.userId)).rejects.toThrow(/khối lượng/);
  });
});
