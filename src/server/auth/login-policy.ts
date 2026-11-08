import { normalizeMmPhone } from "@/lib/phone";
import { MIN_STAFF_PASSWORD } from "./roles";

/** Hàm thuần cho `login-limit.ts` (test được không cần Better Auth/DB). */

export const TOO_MANY_LOGINS = "TOO_MANY_LOGINS";
/** 10 lần đăng nhập / 10 phút / tài khoản. Đủ cho người gõ nhầm, chặn dò mật khẩu từ nhiều IP. */
export const LOGIN_LIMIT = { max: 10, windowMs: 10 * 60_000 } as const;

const PHONE_EMAIL = /^([^@]+)@phone\.glow\.invalid$/;

/**
 * Định danh tài khoản cho bộ đếm đăng nhập, hoặc null nếu không phải request đăng nhập.
 * Email nội bộ `<SĐT>@phone.glow.invalid` quy về cùng khoá với đăng nhập SĐT → hai đường dùng chung một bộ đếm.
 */
export function loginIdentifier(path: string | undefined, body: unknown): string | null {
  const b = (body ?? {}) as Record<string, unknown>;
  if (path === "/sign-in/phone-number") {
    const raw = typeof b.phoneNumber === "string" ? b.phoneNumber.trim() : "";
    return raw ? `phone:${normalizeMmPhone(raw) ?? raw}` : null;
  }
  if (path === "/sign-in/email") {
    const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
    if (!email) return null;
    const phone = PHONE_EMAIL.exec(email)?.[1];
    return phone ? `phone:${normalizeMmPhone(phone) ?? phone}` : `email:${email}`;
  }
  return null;
}

/** Đổi/đặt lại mật khẩu nhân viên qua API với mật khẩu ngắn hơn `MIN_STAFF_PASSWORD` (Better Auth chỉ ép 8). */
export function weakStaffPassword(path: string | undefined, body: unknown): boolean {
  if (path !== "/change-password" && path !== "/reset-password") return false;
  const pw = (body as { newPassword?: unknown } | undefined)?.newPassword;
  return typeof pw === "string" && pw.length < MIN_STAFF_PASSWORD;
}
