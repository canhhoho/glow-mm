import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { rawId } from "@/lib/schemas";
import { prisma } from "@/lib/db";
import { allocateLandedCost, type AllocationMethod } from "./landed-cost";
import { lotCostMmk, type ReceiptCostLine } from "./lot-cost";
import type { Tx } from "./ledger";

/** Chuyến hàng VN→MM: gom chi phí (ship/thuế/phí) và phân bổ vào giá vốn từng lô. */

export const shipmentSchema = z.object({
  code: z.string().trim().min(1).max(30),
  allocationMethod: z.enum(["BY_VALUE", "BY_QTY", "BY_WEIGHT"]).default("BY_VALUE"),
  departedAt: z.coerce.date().optional(),
  note: z.string().max(500).optional(),
});

export const shipmentCostSchema = z.object({
  shipmentId: rawId,
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
  return prisma.$transaction(async tx => { await lockShipment(tx, input.shipmentId); return tx.shipmentCost.create({ data: input }); });
}

export async function removeShipmentCost(costId: string) {
  await prisma.$transaction(async tx => {
    const cost = await tx.shipmentCost.findUniqueOrThrow({ where: { id: costId } });
    await lockShipment(tx, cost.shipmentId);
    await tx.shipmentCost.delete({ where: { id: costId } });
  });
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

export async function setAllocationMethod(shipmentId: string, method: AllocationMethod) {
  const allocationMethod = shipmentSchema.shape.allocationMethod.parse(method);
  await prisma.$transaction(async tx => { await lockShipment(tx, shipmentId); await tx.inboundShipment.update({ where: { id: shipmentId }, data: { allocationMethod } }); });
}

async function lockShipment(tx: Tx, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "InboundShipment" WHERE id = ${id} FOR UPDATE`;
  if (!rows.length) throw new Error("Không tìm thấy chuyến hàng");
}

/** Cùng đầu vào cho phân bổ và cảnh báo stale; không dùng tồn hiện tại làm trọng số. */
async function allocationInput(tx: Tx, shipmentId: string) {
  const shipment = await tx.inboundShipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { costs: { orderBy: { id: "asc" } }, batches: { orderBy: { id: "asc" }, include: { rate: true, variant: { select: { sku: true, weightGrams: true } } } } } });
  const received = await tx.stockLedger.groupBy({ by: ["batchId"], where: { batchId: { in: shipment.batches.map(b => b.id) }, document: { type: "RECEIVE", status: "POSTED" } }, _sum: { qtyDelta: true } });
  const qtyByBatch = new Map(received.map(r => [r.batchId, r._sum.qtyDelta ?? 0]));
  const batches = shipment.batches.flatMap(b => b.unitCostVnd != null && (qtyByBatch.get(b.id) ?? 0) > 0 ? [{ ...b, unitCostVnd: b.unitCostVnd, qty: qtyByBatch.get(b.id)! }] : []);
  const lines = await tx.stockDocumentLine.findMany({
    where: { batchId: { in: batches.map(b => b.id) }, qty: { gt: 0 }, document: { type: "RECEIVE", status: "POSTED" } },
    include: { rate: true },
  });
  const linesByBatch = new Map<string, ReceiptCostLine[]>();
  for (const l of lines) linesByBatch.set(l.batchId!, [...(linesByBatch.get(l.batchId!) ?? []), { qty: l.qty, unitCostVnd: l.unitCostVnd, unitCostMmk: l.unitCostMmk, landedCostVnd: l.landedCostVnd, rateId: l.rateId, rate: l.rate }]);
  const input = { method: shipment.allocationMethod, costs: shipment.costs.map(c => ({ id: c.id, type: c.type, amountVnd: c.amountVnd })), batches: batches.map(b => ({ id: b.id, qty: b.qty, unitCostVnd: b.unitCostVnd, weightGrams: b.variant.weightGrams, rateId: b.rateId, rate: b.rate?.mmkPerVnd.toString() ?? null })) };
  return { shipment, batches, linesByBatch, input, fingerprint: createHash("sha256").update(JSON.stringify(input)).digest("hex"), totalCosts: shipment.costs.reduce((sum,c) => sum + c.amountVnd, 0) };
}

export async function shipmentAllocationStatus(shipmentId: string) {
  return prisma.$transaction(async tx => {
    const current = await allocationInput(tx, shipmentId);
    const history = await tx.shipmentAllocation.findMany({ where: { shipmentId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 10 });
    const users = await tx.user.findMany({ where: { id: { in: history.map(h=>h.createdById) } }, select: { id: true, name: true } });
    const names = new Map(users.map(u=>[u.id,u.name]));
    const results = z.array(z.object({ key: z.string(), allocatedVnd: z.number().int(), landedUnitVnd: z.number().int() })).catch([]);
    return { state: !history.length ? "UNALLOCATED" : history[0].fingerprint === current.fingerprint ? "ALLOCATED" : "STALE", history: history.map(h=>({ ...h, results: results.parse(h.result), createdByName: names.get(h.createdById) ?? h.createdById })) };
  }, { isolationLevel: "RepeatableRead" });
}

/** Gắn rõ ràng lô chưa có chuyến; không sửa chứng từ đã ghi sổ hay snapshot đơn. */
export async function attachBatchToShipment(raw: unknown, userId: string) {
  const { batchId, shipmentId } = z.object({ batchId: rawId, shipmentId: rawId }).parse(raw);
  return prisma.$transaction(async tx => {
    await lockShipment(tx, shipmentId);
    const batch = await tx.batch.findUniqueOrThrow({ where: { id: batchId } });
    if (batch.shipmentId || batch.unitCostVnd == null) throw new Error("Chỉ gắn lô VND chưa thuộc chuyến hàng");
    const other = await tx.stockDocumentLine.count({ where: { batchId, document: { type: "RECEIVE", shipmentId: { not: shipmentId } } } });
    if (other) throw new Error("Lô có phiếu nhập thuộc chuyến khác");
    const changed = await tx.batch.updateMany({ where: { id: batchId, shipmentId: null }, data: { shipmentId } });
    if (changed.count !== 1) throw new Error("Lô vừa được gắn chuyến khác, tải lại trang");
    await tx.auditLog.create({ data: { userId, action: "shipment.attach-batch", entity: "Batch", entityId: batchId, data: { shipmentId } } });
  });
}

/**
 * Tính lại landed cost cho mọi lô thuộc chuyến hàng.
 * Số lượng dùng để phân bổ = tổng đã NHẬP (phiếu RECEIVE đã ghi sổ) của lô, gồm cả tester.
 */
export async function allocateShipment(shipmentId: string, userId: string, selectedMethod?: AllocationMethod) {
  return prisma.$transaction(async (tx) => {
    await lockShipment(tx, shipmentId);
    if (selectedMethod) await tx.inboundShipment.update({ where: { id: shipmentId }, data: { allocationMethod: shipmentSchema.shape.allocationMethod.parse(selectedMethod) } });
    const { shipment, batches, linesByBatch, totalCosts, input, fingerprint } = await allocationInput(tx, shipmentId);
    if (batches.length === 0) throw new Error("Chuyến hàng chưa có lô nào đã nhập kho");
    const missing = shipment.allocationMethod === "BY_WEIGHT" ? batches.filter(b => !b.variant.weightGrams).map(b => b.variant.sku) : [];
    if (missing.length) throw new Error(`Thiếu khối lượng SKU: ${[...new Set(missing)].join(", ")}`);

    const result = allocateLandedCost(
      batches.map((b) => ({ key: b.id, qty: b.qty, unitCostVnd: b.unitCostVnd, weightGrams: b.variant.weightGrams })),
      totalCosts,
      shipment.allocationMethod,
    );

    for (const r of result) {
      const b = batches.find((x) => x.id === r.key)!;
      await tx.batch.update({
        where: { id: b.id },
        data: {
          landedCostVnd: r.landedUnitVnd,
          // Các lần nhập của lô cùng tỷ giá → đổi một lần như trước; khác tỷ giá → đổi từng lần nhập (lot-cost.ts).
          landedCostMmk: lotCostMmk(linesByBatch.get(b.id) ?? [], r.landedUnitVnd, b.rate, r.landedUnitVnd - b.unitCostVnd),
        },
      });
    }
    await tx.shipmentAllocation.create({ data: { shipmentId, createdById: userId, method: shipment.allocationMethod, fingerprint, input, result } });
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
