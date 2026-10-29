import "server-only";
import { prisma } from "@/lib/db";
import type { OrderAccess } from "@/server/cart/cart";
import { normalizeMmPhone } from "@/lib/phone";

/**
 * Nhận đơn cũ vào tài khoản khách (P14): chỉ các đơn khách đã chứng minh trên trình duyệt này (mã + SĐT khớp —
 * cùng điều kiện với `findOrderForCustomer`) và chưa thuộc tài khoản nào. Không bao giờ nhận theo SĐT đơn thuần.
 */
export async function claimOrders(userId: string, entries: OrderAccess[]): Promise<number> {
  let claimed = 0;
  for (const e of entries.slice(0, 10)) {
    const phone = normalizeMmPhone(e.p);
    if (!phone) continue;
    const code = e.c.trim().toUpperCase();
    const order = await prisma.order.findFirst({ where: { code, recipientPhone: phone, accountId: null }, select: { id: true } });
    if (!order) continue;
    // `accountId: null` trong điều kiện → hai phiên đăng nhập cùng lúc không nhận chồng.
    const res = await prisma.order.updateMany({ where: { id: order.id, accountId: null }, data: { accountId: userId } });
    if (res.count === 0) continue;
    claimed++;
    await prisma.auditLog.create({ data: { userId, action: "order.claim", entity: "Order", entityId: order.id, data: { code } } });
  }
  return claimed;
}
