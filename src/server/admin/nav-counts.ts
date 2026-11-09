import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { sellableCutoff } from "@/server/inventory/fefo";
import { getNumberSetting } from "@/server/settings";
import type { NavCountKey } from "./nav";

/**
 * Số đếm cho badge menu admin — chỉ tính những số được yêu cầu (theo quyền của người xem).
 *  - pendingOrders: đơn PENDING.
 *  - awaitingStock: đơn đặt trước chờ hàng về (QT3).
 *  - quarantineLots: số lô còn hàng ở khu Chờ kiểm tra.
 *  - blockedLots: số lô còn hàng (mọi vị trí) đã ngừng bán / hết hạn — như mục "Hạn dùng" ở trang Cảnh báo.
 *  - pendingApplications: đơn đăng ký CTV chờ duyệt (P11).
 */
export async function navCounts(keys: Set<NavCountKey>, now = new Date()): Promise<Partial<Record<NavCountKey, number>>> {
  const distinctLots = async (where: Prisma.StockBalanceWhereInput) =>
    (await prisma.stockBalance.groupBy({ by: ["batchId"], where: { qty: { gt: 0 }, ...where } })).length;

  const jobs: Promise<[NavCountKey, number]>[] = [];
  if (keys.has("pendingOrders")) {
    jobs.push(prisma.order.count({ where: { status: "PENDING" } }).then((n) => ["pendingOrders", n]));
  }
  if (keys.has("awaitingStock")) {
    jobs.push(prisma.order.count({ where: { status: "AWAITING_STOCK" } }).then((n) => ["awaitingStock", n]));
  }
  if (keys.has("quarantineLots")) {
    jobs.push(distinctLots({ location: { type: "QUARANTINE" } }).then((n) => ["quarantineLots", n]));
  }
  if (keys.has("blockedLots")) {
    jobs.push(
      getNumberSetting("expiry.blockDays")
        .then((d) => distinctLots({ batch: { OR: [{ expiryStatus: "UNKNOWN" }, { expiryDate: { lt: sellableCutoff(now, d) } }] } }))
        .then((n) => ["blockedLots", n]),
    );
  }
  if (keys.has("pendingApplications")) {
    jobs.push(prisma.affiliateApplication.count({ where: { status: "PENDING" } }).then((n) => ["pendingApplications", n]));
  }
  return Object.fromEntries(await Promise.all(jobs));
}
