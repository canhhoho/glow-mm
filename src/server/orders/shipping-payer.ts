import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rawId } from "@/lib/schemas";
import { can, type Role } from "@/server/auth/roles";
import { PREPARING_STATUSES } from "./state-machine";
import { OrderError } from "./errors";

export async function setShippingPayer(raw: unknown, actor: { userId: string; role: Role }) {
  if (!can(actor.role, "orders:ship")) throw new OrderError("forbidden", "Không có quyền sửa người trả cước");
  const input = z.object({ orderId: rawId, shippingPayer: z.enum(["RECEIVER", "SENDER"]) }).parse(raw);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${input.orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: input.orderId } });
    if (!order || !(PREPARING_STATUSES as readonly string[]).includes(order.status)) throw new OrderError("invalid_transition", "Chỉ sửa người trả cước khi đơn đang chuẩn bị giao");
    if (order.shippingPayer === input.shippingPayer) return order;
    const updated = await tx.order.update({ where: { id: order.id }, data: { shippingPayer: input.shippingPayer } });
    await tx.auditLog.create({ data: { userId: actor.userId, action: "order.shipping-payer", entity: "Order", entityId: order.id, data: { before: order.shippingPayer, after: input.shippingPayer } } });
    return updated;
  });
}
