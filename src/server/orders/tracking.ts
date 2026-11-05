import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rawId, mmTextReq } from "@/lib/schemas";
import { can, type Role } from "@/server/auth/roles";
import { OrderError } from "./errors";

export async function updateTracking(raw: unknown, actor: { userId: string; role: Role }) {
  if (!can(actor.role, "orders:ship")) throw new OrderError("forbidden", "Không có quyền sửa vận đơn");
  const input = z.object({ orderId: rawId, deliveryId: rawId, carrier: mmTextReq(80), trackingNo: z.string().trim().max(100) }).parse(raw);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${input.orderId} FOR UPDATE`;
    const delivery = await tx.delivery.findFirst({ where: { id: input.deliveryId, orderId: input.orderId } });
    if (!delivery) throw new OrderError("not_found", "Không tìm thấy lần bàn giao");
    const trackingNo = input.trackingNo || null;
    if (delivery.carrier === input.carrier && delivery.trackingNo === trackingNo) return delivery;
    const updated = await tx.delivery.update({ where: { id: delivery.id }, data: { carrier: input.carrier, trackingNo } });
    await tx.auditLog.create({ data: { userId: actor.userId, action: "order.tracking", entity: "Order", entityId: input.orderId, data: { deliveryId: delivery.id, before: { carrier: delivery.carrier, trackingNo: delivery.trackingNo }, after: { carrier: input.carrier, trackingNo } } } });
    return updated;
  });
}
