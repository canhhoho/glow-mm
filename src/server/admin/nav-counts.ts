import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { getNumberSetting } from "@/server/settings";
import { blockedBefore, type NavCountKey } from "./nav";

/**
 * Số đếm cho badge menu admin — chỉ tính những số được yêu cầu (theo quyền của người xem).
 *  - pendingOrders: đơn PENDING.
 *  - quarantineLots: số lô còn hàng ở khu Chờ kiểm tra.
 *  - blockedLots: số lô còn hàng (mọi vị trí) đã ngừng bán / hết hạn — như mục "Hạn dùng" ở trang Cảnh báo.
 */
export async function navCounts(keys: Set<NavCountKey>, now = new Date()): Promise<Partial<Record<NavCountKey, number>>> {
  const distinctLots = async (where: Prisma.StockBalanceWhereInput) =>
    (await prisma.stockBalance.groupBy({ by: ["batchId"], where: { qty: { gt: 0 }, ...where } })).length;

  const jobs: Promise<[NavCountKey, number]>[] = [];
  if (keys.has("pendingOrders")) {
    jobs.push(prisma.order.count({ where: { status: "PENDING" } }).then((n) => ["pendingOrders", n]));
  }
  if (keys.has("quarantineLots")) {
    jobs.push(distinctLots({ location: { type: "QUARANTINE" } }).then((n) => ["quarantineLots", n]));
  }
  if (keys.has("blockedLots")) {
    jobs.push(
      getNumberSetting("expiry.blockDays")
        .then((d) => distinctLots({ batch: { expiryDate: { lt: blockedBefore(now, d) } } }))
        .then((n) => ["blockedLots", n]),
    );
  }
  return Object.fromEntries(await Promise.all(jobs));
}
