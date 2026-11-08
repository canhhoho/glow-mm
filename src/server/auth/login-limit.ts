import "server-only";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { hitRateLimit } from "@/server/rate-limit";
import { loginIdentifier, LOGIN_LIMIT, TOO_MANY_LOGINS, weakStaffPassword } from "./login-policy";

/**
 * `hooks.before` dùng chung cho hai instance Better Auth. Chạy cho cả request HTTP (`/api/auth/*`,
 * `/api/customer-auth/*`) lẫn lời gọi `auth.api.*` từ Server Action → mọi đường đăng nhập đều qua.
 * - Đăng nhập: tối đa `LOGIN_LIMIT.max` lần / `LOGIN_LIMIT.windowMs` cho MỖI tài khoản (SĐT/email), bất kể IP —
 *   giới hạn theo IP của Better Auth không chặn được kẻ dò mật khẩu dùng nhiều IP.
 * - `staffPasswords`: instance nhân viên ép độ dài mật khẩu mới tối thiểu như form admin (đổi/đặt lại qua API).
 */
export function authBeforeHook({ staffPasswords = false } = {}) {
  return createAuthMiddleware(async (ctx) => {
    const id = loginIdentifier(ctx.path, ctx.body);
    if (id && !(await hitRateLimit(`login:${id}`, LOGIN_LIMIT.max, LOGIN_LIMIT.windowMs))) {
      throw APIError.from("TOO_MANY_REQUESTS", { message: "Thử quá nhiều lần, thử lại sau", code: TOO_MANY_LOGINS });
    }
    if (staffPasswords && weakStaffPassword(ctx.path, ctx.body)) {
      throw APIError.from("BAD_REQUEST", { message: "Mật khẩu quá ngắn", code: "PASSWORD_TOO_SHORT" });
    }
  });
}
