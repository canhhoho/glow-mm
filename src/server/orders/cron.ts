import "server-only";
import { prisma } from "@/lib/db";
import { salesBlockDays } from "@/server/inventory/documents";
import type { PaymentMethod } from "./state-machine";
import { transitionInTx } from "./transitions";

/**
 * Tác vụ định kỳ: huỷ đơn PENDING có giữ hàng đã quá hạn (nhả hàng qua máy trạng thái).
 *  - BANK_TRANSFER: quá `reservation.transferHours` mà chưa gửi biên lai.
 *  - COD: quá `cod.confirmHours` mà chưa gọi xác nhận.
 * Tồn khả dụng đã bỏ qua giữ hàng quá hạn ngay lúc đọc; job này chỉ dọn trạng thái cho khớp.
 */
export async function cancelExpiredOrders(method: PaymentMethod, now = new Date()) {
  const blockDays = await salesBlockDays();
  const due = await prisma.order.findMany({
    where: {
      status: "PENDING",
      paymentMethod: method,
      reservations: { some: { status: "ACTIVE", expiresAt: { lte: now } } },
    },
    select: { id: true },
    take: 500,
  });

  const reason = method === "COD" ? "Quá hạn gọi xác nhận COD" : "Quá hạn chuyển khoản";
  let cancelled = 0;
  const errors: string[] = [];
  for (const o of due) {
    try {
      await prisma.$transaction(
        async (tx) => {
          // Kiểm tra lại sau khi khoá: nhân viên có thể vừa xác nhận đơn.
          await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${o.id} FOR UPDATE`;
          const still = await tx.reservation.count({
            where: { orderId: o.id, status: "ACTIVE", expiresAt: { lte: now }, order: { status: "PENDING" } },
          });
          if (still === 0) return;
          await transitionInTx(tx, o.id, "cancel", { system: true }, { reason }, { now, blockDays });
          cancelled++;
        },
        { maxWait: 10_000, timeout: 30_000 },
      );
    } catch (e) {
      errors.push(`${o.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { due: due.length, cancelled, errors };
}
