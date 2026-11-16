import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rawId, mmTextReq } from "@/lib/schemas";
import { can, type Role } from "@/server/auth/roles";
import { summarizeCod } from "./cod-aging";

const schema = z.object({
  orderId: rawId,
  receivedMmk: z.coerce.number().int().min(0).max(2_147_483_647),
  feeMmk: z.coerce.number().int().min(0).max(2_147_483_647),
  reference: z.string().trim().min(1).max(150),
});

/** Full settlement per order; carrier fees explain the difference to customer COD. */
export async function remitCod(raw: unknown, actor: { userId: string; role: Role }) {
  if (!can(actor.role, "orders:reconcile-cod")) throw new Error("Không có quyền đối soát COD");
  const input = schema.parse(raw);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${input.orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: input.orderId }, include: { items: true } });
    if (!order || order.paymentMethod !== "COD" || !order.codCollectedAt) throw new Error("Đơn chưa ghi nhận hãng vận chuyển đã thu COD");
    if (order.codRemittedAt) throw new Error("Đơn đã được đối soát tiền về");
    // Returns/refunds require their own accounting, never guess how much the carrier owes.
    if (order.status !== "COMPLETED" || order.paymentStatus !== "PAID" || order.items.some((i) => i.returnedQty > 0)) throw new Error("Chỉ đối soát trực tiếp đơn hoàn tất chưa có hoàn hàng/hoàn tiền");
    if (input.receivedMmk + input.feeMmk !== order.totalMmk) throw new Error("Tiền về + phí hãng khấu trừ phải bằng số COD đã thu của đơn");
    const updated = await tx.order.update({ where: { id: order.id }, data: { codRemittedAt: new Date(), codRemittedMmk: input.receivedMmk, codCarrierFeeMmk: input.feeMmk, codRemittanceRef: input.reference } });
    await tx.auditLog.create({ data: { userId: actor.userId, action: "order.cod-remit", entity: "Order", entityId: order.id, data: { receivedMmk: input.receivedMmk, feeMmk: input.feeMmk, reference: input.reference } } });
    return updated;
  });
}

export async function outstandingCod() {
  return prisma.order.findMany({ where: { paymentMethod: "COD", codCollectedAt: { not: null }, codRemittedAt: null }, orderBy: { codCollectedAt: "asc" }, include: { items: { select: { returnedQty: true } }, deliveries: { orderBy: { createdAt: "desc" }, take: 1 } } });
}

/** Tổng COD chưa về (thường + ngoại lệ) — cùng nguồn `outstandingCod()` với trang Đối soát COD. */
export async function outstandingCodSummary() {
  return summarizeCod(await outstandingCod());
}

/** Close an exception only with explicitly reconciled amounts; no automatic refund inference. */
export async function settleCodException(raw: unknown, actor: { userId: string; role: Role }) {
  if (!can(actor.role, "orders:reconcile-cod")) throw new Error("Không có quyền đối soát COD");
  const input = schema.extend({ adjustmentMmk: z.coerce.number().int().min(0).max(2_147_483_647), note: mmTextReq(1000) }).parse(raw);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${input.orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: input.orderId }, include: { items: true } });
    if (!order || order.paymentMethod !== "COD" || !order.codCollectedAt) throw new Error("Đơn chưa ghi nhận hãng vận chuyển đã thu COD");
    if (order.codRemittedAt) throw new Error("Đơn đã được đối soát tiền về");
    if (order.status !== "COMPLETED" && order.status !== "RETURNED") throw new Error("Chỉ đóng ngoại lệ cho đơn đã hoàn tất hoặc trả hàng");
    if (order.status === "COMPLETED" && order.paymentStatus === "PAID" && !order.items.some((i) => i.returnedQty > 0)) throw new Error("Đơn không có ngoại lệ; dùng đối soát COD thông thường");
    if (input.receivedMmk + input.feeMmk + input.adjustmentMmk !== order.totalMmk) throw new Error("Tiền về + phí hãng + giảm thu phải bằng COD gốc");
    const updated = await tx.order.update({ where: { id: order.id }, data: {
      codRemittedAt: new Date(), codRemittedMmk: input.receivedMmk, codCarrierFeeMmk: input.feeMmk,
      codAdjustmentMmk: input.adjustmentMmk, codSettlementNote: input.note, codRemittanceRef: input.reference,
    } });
    await tx.auditLog.create({ data: { userId: actor.userId, action: "order.cod-exception", entity: "Order", entityId: order.id, data: input } });
    return updated;
  });
}
