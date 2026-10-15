import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { allocateLandedCost, vndToMmk } from "./landed-cost";

/** Chuyến hàng VN→MM: gom chi phí (ship/thuế/phí) và phân bổ vào giá vốn từng lô. */

export const shipmentSchema = z.object({
  code: z.string().trim().min(1).max(30),
  allocationMethod: z.enum(["BY_VALUE", "BY_QTY"]).default("BY_VALUE"),
  departedAt: z.coerce.date().optional(),
  note: z.string().max(500).optional(),
});

export const shipmentCostSchema = z.object({
  shipmentId: z.string().min(1),
  type: z.enum(["SHIPPING", "TAX", "FEE"]),
  amountVnd: z.coerce.number().int().positive(),
  note: z.string().max(200).optional(),
});

export async function createShipment(raw: unknown) {
  const input = shipmentSchema.parse(raw);
  return prisma.inboundShipment.create({ data: input });
}

export async function addShipmentCost(raw: unknown) {
  const input = shipmentCostSchema.parse(raw);
  return prisma.shipmentCost.create({ data: input });
}

export async function removeShipmentCost(costId: string) {
  await prisma.shipmentCost.delete({ where: { id: costId } });
}

/** Đánh dấu chuyến đã đến (hết "đang vận chuyển" trên báo cáo). Ghi ngày đi nếu chưa có. */
export async function markShipmentArrived(shipmentId: string, userId: string, at = new Date()) {
  const s = await prisma.inboundShipment.findUniqueOrThrow({ where: { id: shipmentId } });
  if (s.arrivedAt) throw new Error("Chuyến hàng đã được đánh dấu đã đến");
  await prisma.inboundShipment.update({
    where: { id: shipmentId },
    data: { arrivedAt: at, departedAt: s.departedAt ?? at },
  });
  await prisma.auditLog.create({
    data: { userId, action: "shipment.arrived", entity: "InboundShipment", entityId: shipmentId },
  });
}

export async function setAllocationMethod(shipmentId: string, method: "BY_VALUE" | "BY_QTY") {
  await prisma.inboundShipment.update({ where: { id: shipmentId }, data: { allocationMethod: method } });
}

/**
 * Tính lại landed cost cho mọi lô thuộc chuyến hàng.
 * Số lượng dùng để phân bổ = tổng đã NHẬP (phiếu RECEIVE đã ghi sổ) của lô, gồm cả tester.
 */
export async function allocateShipment(shipmentId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const shipment = await tx.inboundShipment.findUniqueOrThrow({
      where: { id: shipmentId },
      include: { costs: true, batches: { include: { rate: true } } },
    });
    const totalCosts = shipment.costs.reduce((s, c) => s + c.amountVnd, 0);

    const received = await tx.stockLedger.groupBy({
      by: ["batchId"],
      where: { batchId: { in: shipment.batches.map((b) => b.id) }, document: { type: "RECEIVE", status: "POSTED" } },
      _sum: { qtyDelta: true },
    });
    const qtyByBatch = new Map(received.map((r) => [r.batchId, r._sum.qtyDelta ?? 0]));
    const batches = shipment.batches.filter((b) => (qtyByBatch.get(b.id) ?? 0) > 0);
    if (batches.length === 0) throw new Error("Chuyến hàng chưa có lô nào đã nhập kho");

    const result = allocateLandedCost(
      batches.map((b) => ({ key: b.id, qty: qtyByBatch.get(b.id)!, unitCostVnd: b.unitCostVnd })),
      totalCosts,
      shipment.allocationMethod,
    );

    for (const r of result) {
      const b = batches.find((x) => x.id === r.key)!;
      await tx.batch.update({
        where: { id: b.id },
        data: {
          landedCostVnd: r.landedUnitVnd,
          landedCostMmk: b.rate ? vndToMmk(r.landedUnitVnd, b.rate.mmkPerVnd.toString()) : null,
        },
      });
    }
    await tx.auditLog.create({
      data: {
        userId,
        action: "shipment.allocate",
        entity: "InboundShipment",
        entityId: shipmentId,
        data: { totalCosts, method: shipment.allocationMethod, batches: result.length },
      },
    });
    return result;
  });
}
