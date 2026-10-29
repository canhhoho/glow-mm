import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { storage } from "@/server/adapters/storage";
import { can } from "@/server/auth/roles";
import { salesBlockDays } from "@/server/inventory/documents";
import { OrderError } from "./errors";
import { normalizeMmPhone } from "@/lib/phone";
import { holdIndefinitely } from "./reservations";
import { transitionInTx, type Actor } from "./transitions";

/**
 * Chuyển khoản thủ công: khách upload biên lai (file PRIVATE) → nhân viên duyệt/từ chối.
 * Duyệt = chuyển đơn sang PAYMENT_CONFIRMED qua máy trạng thái.
 */

export const PROOF_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
export const PROOF_MAX_BYTES = 5 * 1024 * 1024;

export async function submitPaymentProof(input: {
  orderCode: string;
  phone: string;
  file: { data: Buffer; mime: string };
}) {
  const ext = PROOF_MIME[input.file.mime];
  if (!ext || input.file.data.length === 0 || input.file.data.length > PROOF_MAX_BYTES) {
    throw new OrderError("invalid_file", "File biên lai không hợp lệ (JPG/PNG/WebP/PDF, tối đa 5MB)");
  }
  const phone = normalizeMmPhone(input.phone);
  const order = await prisma.order.findUnique({ where: { code: input.orderCode.trim().toUpperCase() } });
  if (!order || !phone || order.recipientPhone !== phone) throw new OrderError("not_found", "Không tìm thấy đơn");
  if (
    order.paymentMethod !== "BANK_TRANSFER" ||
    order.status !== "PENDING" ||
    !["UNPAID", "REJECTED"].includes(order.paymentStatus)
  ) {
    throw new OrderError("proof_not_allowed", "Đơn không ở trạng thái chờ biên lai");
  }

  // Khoá ngẫu nhiên khó đoán: Vercel Blob hiện lưu public [CẦN XÁC MINH: chuyển sang blob private khi có].
  const key = `proofs/${randomBytes(16).toString("hex")}.${ext}`;
  const stored = await (await storage()).put(key, input.file.data, input.file.mime);
  const blockDays = await salesBlockDays();

  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${order.id} FOR UPDATE`;
      const fresh = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
      if (fresh.status !== "PENDING") throw new OrderError("proof_not_allowed", "Đơn không ở trạng thái chờ biên lai");
      const file = await tx.fileObject.create({
        data: { ...stored, url: `/api/files/${key}`, visibility: "PRIVATE" },
      });
      const proof = await tx.paymentProof.create({ data: { orderId: order.id, fileId: file.id } });
      // Đã có biên lai → giữ hàng đến khi nhân viên duyệt (không tự huỷ theo hạn chuyển khoản).
      await holdIndefinitely(tx, order.id, { now: new Date(), blockDays });
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "PROOF_SUBMITTED" } });
      await tx.auditLog.create({
        data: { action: "order.proof", entity: "Order", entityId: order.id, data: { code: order.code, proofId: proof.id } },
      });
      return proof;
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}

export async function reviewPaymentProof(proofId: string, approve: boolean, actor: Actor, note?: string) {
  const blockDays = await salesBlockDays();
  if ("system" in actor || !can(actor.role, "orders:confirm-payment")) {
    throw new OrderError("forbidden", "Không có quyền duyệt thanh toán");
  }
  const userId = actor.userId;
  return prisma.$transaction(
    async (tx) => {
      const claimed = await tx.paymentProof.updateMany({
        where: { id: proofId, status: "PENDING" },
        data: { status: approve ? "APPROVED" : "REJECTED", reviewedById: userId, reviewedAt: new Date(), note: note || null },
      });
      if (claimed.count !== 1) throw new OrderError("invalid_transition", "Biên lai đã được xử lý");
      const proof = await tx.paymentProof.findUniqueOrThrow({ where: { id: proofId } });

      if (approve) {
        return transitionInTx(tx, proof.orderId, "confirmPayment", actor, { note }, { now: new Date(), blockDays });
      }
      // Từ chối: khách upload lại được; giữ hàng tiếp tục đến khi nhân viên huỷ đơn.
      return tx.order.update({ where: { id: proof.orderId }, data: { paymentStatus: "REJECTED" } });
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}
