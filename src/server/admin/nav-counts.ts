import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { FEATURES } from "@/lib/features";
import { blockedBatchWhere } from "@/server/inventory/fefo";
import { getNumberSetting } from "@/server/settings";
import type { NavCountKey } from "./nav";
import { pendingPasswordResetCount } from "@/server/accounts/password-reset";
import { lowStockCount } from "@/server/alerts/queries";

/**
 * Số đếm cho badge menu admin — chỉ tính những số được yêu cầu (theo quyền của người xem).
 *  - pendingOrders: đơn PENDING.
 *  - awaitingStock: đơn đặt trước chờ hàng về (QT3).
 *  - quarantineLots: số lô còn hàng ở khu Chờ kiểm tra.
 *  - blockedLots: số lô còn hàng (mọi vị trí) đã ngừng bán / hết hạn — như mục "Hạn dùng" ở trang Cảnh báo.
 *  - pendingApplications: đơn đăng ký CTV chờ duyệt (P11).
 *  - passwordResets: yêu cầu đặt lại mật khẩu của khách chờ admin xác nhận.
 *  - lowStock: số phân loại tồn thấp (như tab Tồn thấp ở trang Cảnh báo) — badge trên mục Tồn kho (20/11/2026).
 *  - agentDrafts: phiếu kho NHÁP do trợ lý AI tạo, chờ người kiểm và ghi sổ (P25 gói A).
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
    if (!FEATURES.expiry) {
      jobs.push(Promise.resolve(["blockedLots", 0]));
    } else {
      jobs.push(
        getNumberSetting("expiry.blockDays")
          .then((d) => distinctLots({ batch: blockedBatchWhere(now, d) }))
          .then((n) => ["blockedLots", n]),
      );
    }
  }
  if (keys.has("pendingApplications")) {
    jobs.push(prisma.affiliateApplication.count({ where: { status: "PENDING" } }).then((n) => ["pendingApplications", n]));
  }
  if (keys.has("passwordResets")) jobs.push(pendingPasswordResetCount(now).then((n) => ["passwordResets", n]));
  if (keys.has("lowStock")) jobs.push(lowStockCount(now).then((n) => ["lowStock", n]));
  if (keys.has("pendingReviews")) {
    jobs.push(prisma.review.count({ where: { status: "PENDING" } }).then((n) => ["pendingReviews", n]));
  }
  if (keys.has("agentDrafts")) {
    jobs.push(prisma.stockDocument.count({ where: { source: "AGENT", status: "DRAFT" } }).then((n) => ["agentDrafts", n]));
  }
  return Object.fromEntries(await Promise.all(jobs));
}
