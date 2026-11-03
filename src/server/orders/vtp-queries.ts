import "server-only";
import { prisma } from "@/lib/db";
import { PREPARING_STATUSES } from "./state-machine";

/** Only orders ready to hand over; exporting does not change stock or order status. */
export async function vtpOrders(ids?: string[]) {
  return prisma.order.findMany({
    where: { status: { in: [...PREPARING_STATUSES] }, ...(ids ? { id: { in: ids } } : {}) },
    include: { items: { include: { variant: { select: { weightGrams: true } } } } },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
}
