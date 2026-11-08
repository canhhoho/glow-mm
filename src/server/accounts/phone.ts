import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { confirmPasswordSchema, localeSchema, mmTextReq, newPasswordSchema, phoneSchema, withConfirm } from "@/lib/schemas";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/lib/db";
import { CUSTOMER_ROLE, phoneEmail } from "@/server/auth/customer-policy";
import { hitRateLimit } from "@/server/rate-limit";
import { normalizeMmPhone } from "@/lib/phone";

/**
 * Tài khoản khách bằng SĐT + mật khẩu (P17) — không OTP, nên SĐT chưa được xác minh:
 * không dùng để gắn đơn cũ, không dùng để lấy lại mật khẩu (khách nhắn shop, admin đặt lại).
 * Tạo bằng Prisma (không qua API Better Auth); đăng nhập qua plugin phoneNumber (`signInPhoneNumber`).
 */

export type PhoneAccountErrorCode = "invalid_phone" | "phone_taken" | "too_many";

export class PhoneAccountError extends Error {
  constructor(
    public readonly code: PhoneAccountErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PhoneAccountError";
  }
}

export const MIN_CUSTOMER_PASSWORD = 8;
/** Chống tạo hàng loạt: tối đa 10 tài khoản SĐT / giờ / IP (mạng di động Myanmar dùng chung IP → không đặt quá chặt). */
export const MAX_PHONE_SIGNUPS_PER_IP_PER_HOUR = 10;
const HOUR_MS = 60 * 60 * 1000;

export const registerPhoneSchema = withConfirm(
  z.object({
    name: mmTextReq(100),
    phone: phoneSchema,
    password: newPasswordSchema(MIN_CUSTOMER_PASSWORD),
    confirmPassword: confirmPasswordSchema,
    locale: localeSchema.catch("my"),
  }),
  "password",
);

/**
 * Vượt `max` trong `windowMs` → too_many. Cần cho đường SĐT vì gọi `customerAuth.api.*` từ server không đi qua
 * rate limit HTTP của Better Auth.
 */
export async function consumeRateLimit(key: string, max: number, windowMs: number, now = new Date()) {
  if (!(await hitRateLimit(key, max, windowMs, now))) throw new PhoneAccountError("too_many", "Thử quá nhiều lần, thử lại sau");
}

/**
 * Đăng nhập SĐT từ form: tối đa 20 lần / phút / IP. Giới hạn theo từng SĐT (10 lần / 10 phút) nằm ở hook
 * Better Auth (`server/auth/login-limit.ts`) để áp cả cho người gọi thẳng `/api/customer-auth/sign-in/phone-number`.
 */
export async function consumePhoneLoginLimit(ip: string, now = new Date()) {
  await consumeRateLimit(`phone-login:${ip || "unknown"}`, 20, 60_000, now);
}

/** Tạo khách mới bằng SĐT + mật khẩu. Trả SĐT đã chuẩn hoá (để đăng nhập ngay sau đó). */
export async function registerPhoneCustomer(raw: unknown, ctx: { ip: string; now?: Date }) {
  const input = registerPhoneSchema.parse(raw);
  const phone = normalizeMmPhone(input.phone);
  if (!phone) throw new PhoneAccountError("invalid_phone", "Số điện thoại không hợp lệ");
  // Đếm TRƯỚC khi báo "SĐT đã có tài khoản" — nếu không, form đăng ký thành công cụ dò SĐT nào đã đăng ký không giới hạn.
  await consumeRateLimit(`phone-signup:${ctx.ip || "unknown"}`, MAX_PHONE_SIGNUPS_PER_IP_PER_HOUR, HOUR_MS, ctx.now ?? new Date());
  if (await prisma.user.findFirst({ where: { OR: [{ phoneNumber: phone }, { email: phoneEmail(phone) }] }, select: { id: true } })) {
    throw new PhoneAccountError("phone_taken", "Số điện thoại đã có tài khoản");
  }
  const id = randomUUID();
  const hash = await hashPassword(input.password);
  try {
    await prisma.user.create({
      data: {
        id,
        name: input.name,
        email: phoneEmail(phone),
        // Email nội bộ, không phải email thật → đánh dấu đã xác minh để không bao giờ gửi mail xác minh.
        emailVerified: true,
        phoneNumber: phone,
        phoneNumberVerified: false,
        role: CUSTOMER_ROLE,
        locale: input.locale,
        accounts: { create: { id: randomUUID(), accountId: id, providerId: "credential", password: hash } },
      },
    });
  } catch (e) {
    // Hai lần gửi cùng lúc: unique phoneNumber/email chặn bản thứ hai.
    if ((e as { code?: string }).code === "P2002") throw new PhoneAccountError("phone_taken", "Số điện thoại đã có tài khoản");
    throw e;
  }
  return { userId: id, phone };
}
