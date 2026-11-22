import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { confirmPasswordSchema, newPasswordSchema, phoneSchema, rawId, withConfirm } from "@/lib/schemas";
import { prisma } from "@/lib/db";
import { normalizeMmPhone } from "@/lib/phone";
import { CUSTOMER_ROLE, phoneEmail } from "@/server/auth/customer-policy";
import { consumeRateLimit, MIN_CUSTOMER_PASSWORD, PhoneAccountError } from "./phone";

/**
 * Khách (tài khoản SĐT) quên mật khẩu — không SMS/OTP, không email (audit 12, gói D3 — phương án B):
 * khách nhập SĐT + mật khẩu mới → mật khẩu mới có hiệu lực NGAY, mọi phiên cũ bị thu hồi.
 *
 * - Giới hạn tần suất 3 lần/ngày/SĐT, 5 lần/giờ/IP. Không lưu hash trong bản ghi theo dõi.
 * - Luôn trả cùng một thông báo cho khách dù SĐT có tài khoản hay không (không dò được SĐT đã đăng ký).
 * - Bản ghi APPROVED + decidedById = null = "chưa xem": hiện ở /admin/customer-accounts 7 ngày để admin
 *   bấm "Đã kiểm tra" hoặc khoá tài khoản nếu nghi ngờ. Chỉ role CUSTOMER (CTV do admin đặt lại).
 * - Bản PENDING kiểu cũ (trước D3) vẫn được admin xác nhận/từ chối và cron dọn khi quá hạn.
 */

export type PasswordResetErrorCode = "not_found" | "not_pending" | "expired" | "not_customer";

export class PasswordResetError extends Error {
  constructor(
    public readonly code: PasswordResetErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PasswordResetError";
  }
}

export const RESET_TTL_DAYS = 7;
export const MAX_RESETS_PER_IP_PER_HOUR = 5;
export const MAX_RESETS_PER_PHONE_PER_DAY = 3;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const requestResetSchema = withConfirm(
  z.object({
    phone: phoneSchema,
    password: newPasswordSchema(MIN_CUSTOMER_PASSWORD),
    confirmPassword: confirmPasswordSchema,
  }),
  "password",
);

/**
 * Khách gửi yêu cầu. Trả `{ created }` chỉ để test/log — form luôn hiện cùng một câu cho khách.
 * Giới hạn tần suất đếm TRƯỚC khi tra tài khoản (theo IP và theo SĐT đã chuẩn hoá, kể cả SĐT chưa đăng ký).
 */
export async function requestPasswordReset(raw: unknown, ctx: { ip: string; now?: Date }) {
  const input = requestResetSchema.parse(raw);
  const phone = normalizeMmPhone(input.phone);
  if (!phone) throw new PhoneAccountError("invalid_phone", "Số điện thoại không hợp lệ");
  const now = ctx.now ?? new Date();
  await consumeRateLimit(`pwreset-ip:${ctx.ip || "unknown"}`, MAX_RESETS_PER_IP_PER_HOUR, HOUR_MS, now);
  await consumeRateLimit(`pwreset-phone:${phone}`, MAX_RESETS_PER_PHONE_PER_DAY, DAY_MS, now);

  // Băm TRƯỚC khi tra tài khoản: thời gian phản hồi không lộ SĐT có tài khoản hay không.
  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.findFirst({
    where: { role: CUSTOMER_ROLE, OR: [{ phoneNumber: phone }, { email: phoneEmail(phone) }] },
    select: { id: true },
  });
  if (!user) return { created: false as const };

  await prisma.$transaction(async (tx) => {
    // Khoá dòng user: tránh xung đột khi có yêu cầu đồng thời
    await tx.$queryRaw`SELECT "id" FROM "user" WHERE "id" = ${user.id} FOR UPDATE`;

    // 1. Cập nhật mật khẩu ngay lập tức vào bảng account
    const updated = await tx.account.updateMany({
      where: { userId: user.id, providerId: "credential" },
      data: { password: passwordHash },
    });
    if (updated.count === 0) {
      await tx.account.create({
        data: {
          id: randomUUID(),
          accountId: user.id,
          providerId: "credential",
          userId: user.id,
          password: passwordHash,
        },
      });
    }

    // 2. Thu hồi toàn bộ phiên đăng nhập cũ của tài khoản
    await tx.session.deleteMany({ where: { userId: user.id } });

    // 3. Đánh dấu các bản ghi cũ là SUPERSEDED
    await tx.passwordResetRequest.updateMany({
      where: { userId: user.id, status: { in: ["PENDING", "APPROVED"] }, decidedById: null },
      data: { status: "SUPERSEDED", passwordHash: null, decidedAt: now },
    });

    // 4. Tạo bản ghi đặt lại mật khẩu tự động (decidedById = null để admin theo dõi)
    await tx.passwordResetRequest.create({
      data: {
        userId: user.id,
        phone,
        passwordHash: null,
        status: "APPROVED",
        ip: ctx.ip || null,
        createdAt: now,
        expiresAt: new Date(now.getTime() + RESET_TTL_DAYS * DAY_MS),
        decidedAt: now,
        decidedById: null,
      },
    });

    // 5. Ghi nhật ký kiểm toán (AuditLog)
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "customer.passwordReset.auto",
        entity: "User",
        entityId: user.id,
      },
    });
  });
  return { created: true as const };
}

const pendingWhere = (now: Date) => ({
  OR: [
    { status: "PENDING" as const, expiresAt: { gt: now } },
    { status: "APPROVED" as const, decidedById: null, createdAt: { gte: new Date(now.getTime() - RESET_TTL_DAYS * DAY_MS) } },
  ],
});

/** Số yêu cầu đang chờ / vừa đổi tự động chưa xem (badge menu admin). */
export function pendingPasswordResetCount(now = new Date()) {
  return prisma.passwordResetRequest.count({ where: pendingWhere(now) });
}

/** Yêu cầu đang chờ hoặc vừa đổi tự động cho trang admin (mới nhất trước). */
export async function listPasswordResetRequests(now = new Date()) {
  const rows = await prisma.passwordResetRequest.findMany({
    where: pendingWhere(now),
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      phone: true,
      createdAt: true,
      expiresAt: true,
      user: { select: { id: true, name: true, active: true, createdAt: true, _count: { select: { orders: true } } } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    phone: r.phone,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    userId: r.user.id,
    name: r.user.name,
    active: r.user.active,
    accountCreatedAt: r.user.createdAt,
    orders: r.user._count.orders,
  }));
}

/**
 * Admin xác nhận đã kiểm tra / xử lý yêu cầu đổi mật khẩu.
 */
export async function decidePasswordReset(idRaw: unknown, approve: boolean, actorId: string, now = new Date()) {
  const id = rawId.parse(idRaw);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "PasswordResetRequest" WHERE "id" = ${id} FOR UPDATE`;
    const req = await tx.passwordResetRequest.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true, expiresAt: true, passwordHash: true, user: { select: { role: true } } },
    });
    if (!req) throw new PasswordResetError("not_found", "Không tìm thấy yêu cầu");
    if (req.status !== "PENDING" && req.status !== "APPROVED") throw new PasswordResetError("not_pending", "Yêu cầu đã được xử lý");

    // Xử lý bản ghi cũ (PENDING) nếu có
    if (req.status === "PENDING" && approve && req.passwordHash) {
      if (req.user.role !== CUSTOMER_ROLE) throw new PasswordResetError("not_customer", "Không phải tài khoản khách");
      const updated = await tx.account.updateMany({ where: { userId: req.userId, providerId: "credential" }, data: { password: req.passwordHash } });
      if (updated.count === 0) {
        await tx.account.create({ data: { id: randomUUID(), accountId: req.userId, providerId: "credential", userId: req.userId, password: req.passwordHash } });
      }
      await tx.session.deleteMany({ where: { userId: req.userId } });
    }

    await tx.passwordResetRequest.update({
      where: { id },
      data: { status: approve ? "APPROVED" : "REJECTED", passwordHash: null, decidedAt: now, decidedById: actorId },
    });
    await tx.auditLog.create({
      data: { userId: actorId, action: approve ? "customer.passwordReset.approve" : "customer.passwordReset.reject", entity: "User", entityId: req.userId },
    });
  });
}

/** Dọn yêu cầu quá hạn (cron `cleanup`): chuyển REJECTED, decidedById null = hệ thống, xoá hash. */
export async function expirePasswordResets(now = new Date()) {
  const r = await prisma.passwordResetRequest.updateMany({
    where: { status: "PENDING", expiresAt: { lte: now } },
    data: { status: "REJECTED", passwordHash: null, decidedAt: now },
  });
  return r.count;
}
