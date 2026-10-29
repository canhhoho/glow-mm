import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/lib/db";
import { toUnicode } from "@/lib/myanmar";
import { CUSTOMER_ROLE, phoneEmail } from "@/server/auth/customer-policy";
import { hitRateLimit } from "@/server/rate-limit";
import { normalizeMmPhone } from "@/server/orders/pricing";

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

export const registerPhoneSchema = z
  .object({
    name: z.string().trim().min(1).max(100).transform(toUnicode),
    phone: z.string().trim().min(1).max(30),
    password: z.string().min(MIN_CUSTOMER_PASSWORD).max(128),
    confirmPassword: z.string().max(128),
    locale: z.enum(["my", "en"]).catch("my"),
  })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"], message: "mismatch" });

/**
 * Vượt `max` trong `windowMs` → too_many. Cần cho đường SĐT vì gọi `customerAuth.api.*` từ server không đi qua
 * rate limit HTTP của Better Auth.
 */
export async function consumeRateLimit(key: string, max: number, windowMs: number, now = new Date()) {
  if (!(await hitRateLimit(key, max, windowMs, now))) throw new PhoneAccountError("too_many", "Thử quá nhiều lần, thử lại sau");
}

/** Đăng nhập SĐT: tối đa 20 lần / phút / IP và 10 lần / 10 phút / SĐT (chống dò mật khẩu một số cụ thể). */
export async function consumePhoneLoginLimit(ip: string, phone: string, now = new Date()) {
  await consumeRateLimit(`phone-login:${ip || "unknown"}`, 20, 60_000, now);
  await consumeRateLimit(`phone-login-n:${phone}`, 10, 10 * 60_000, now);
}

/** Tạo khách mới bằng SĐT + mật khẩu. Trả SĐT đã chuẩn hoá (để đăng nhập ngay sau đó). */
export async function registerPhoneCustomer(raw: unknown, ctx: { ip: string; now?: Date }) {
  const input = registerPhoneSchema.parse(raw);
  const phone = normalizeMmPhone(input.phone);
  if (!phone) throw new PhoneAccountError("invalid_phone", "Số điện thoại không hợp lệ");
  if (await prisma.user.findFirst({ where: { OR: [{ phoneNumber: phone }, { email: phoneEmail(phone) }] }, select: { id: true } })) {
    throw new PhoneAccountError("phone_taken", "Số điện thoại đã có tài khoản");
  }
  await consumeRateLimit(`phone-signup:${ctx.ip || "unknown"}`, MAX_PHONE_SIGNUPS_PER_IP_PER_HOUR, HOUR_MS, ctx.now ?? new Date());
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
