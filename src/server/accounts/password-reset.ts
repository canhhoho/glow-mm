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
 * Khách (tài khoản SĐT) quên mật khẩu — không SMS/OTP, không email: khách tự nhập mật khẩu mới trên web → YÊU CẦU chờ,
 * admin xác nhận trên web admin (không gọi khách) → mật khẩu mới có hiệu lực, mọi phiên cũ bị thu hồi.
 *
 * - Mật khẩu cũ dùng được cho tới khi admin xác nhận. Chỉ lưu HASH; hash xoá (null) khi yêu cầu kết thúc.
 * - Gửi yêu cầu luôn trả "đã nhận" dù SĐT có tài khoản hay không (không dò được SĐT đã đăng ký).
 * - Mỗi khách một yêu cầu chờ (gửi lại → bản cũ SUPERSEDED); hết hạn sau 7 ngày. Chỉ role CUSTOMER (CTV do admin đặt lại).
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
    // Khoá dòng user: hai yêu cầu cùng lúc không tạo hai bản PENDING.
    await tx.$queryRaw`SELECT "id" FROM "user" WHERE "id" = ${user.id} FOR UPDATE`;
    await tx.passwordResetRequest.updateMany({
      where: { userId: user.id, status: "PENDING" },
      data: { status: "SUPERSEDED", passwordHash: null, decidedAt: now },
    });
    await tx.passwordResetRequest.create({
      data: { userId: user.id, phone, passwordHash, ip: ctx.ip || null, createdAt: now, expiresAt: new Date(now.getTime() + RESET_TTL_DAYS * DAY_MS) },
    });
  });
  return { created: true as const };
}

const pendingWhere = (now: Date) => ({ status: "PENDING" as const, expiresAt: { gt: now } });

/** Số yêu cầu đang chờ (badge menu admin). */
export function pendingPasswordResetCount(now = new Date()) {
  return prisma.passwordResetRequest.count({ where: pendingWhere(now) });
}

/** Yêu cầu đang chờ cho trang admin (cũ nhất trước). Không trả hash. */
export async function listPasswordResetRequests(now = new Date()) {
  const rows = await prisma.passwordResetRequest.findMany({
    where: pendingWhere(now),
    orderBy: { createdAt: "asc" },
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
 * Admin xác nhận / từ chối. Một transaction, khoá yêu cầu: hai admin bấm cùng lúc → đúng một người thành công.
 * Xác nhận: ghi mật khẩu (tạo tài khoản `credential` nếu chưa có), xoá mọi phiên, KHÔNG mở khoá tài khoản đang bị khoá.
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
    if (req.status !== "PENDING") throw new PasswordResetError("not_pending", "Yêu cầu đã được xử lý");
    if (req.expiresAt <= now) throw new PasswordResetError("expired", "Yêu cầu đã hết hạn");
    if (approve) {
      if (req.user.role !== CUSTOMER_ROLE || !req.passwordHash) throw new PasswordResetError("not_customer", "Không phải tài khoản khách");
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
