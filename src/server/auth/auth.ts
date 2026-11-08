import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { APIError } from "better-auth/api";
import { IP_HEADERS } from "@/lib/client-ip";
import { prisma } from "@/lib/db";
import { USER_INACTIVE } from "./roles";
import { NOT_STAFF, staffSessionDecision } from "./customer-policy";
import { authBeforeHook } from "./login-limit";

/**
 * Better Auth cho NHÂN VIÊN + CTV (/api/auth). Tự đăng ký bị tắt; admin tạo tài khoản (Prisma trực tiếp).
 * Khách hàng dùng instance riêng `customer-auth.ts` (P14) — hook dưới đây từ chối tạo phiên cho role khác.
 */
export const auth = betterAuth({
  baseURL: process.env.APP_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // IP cho rate limit: header do proxy đặt (Traefik/Vercel), xem src/lib/client-ip.ts.
  advanced: { ipAddress: { ipAddressHeaders: IP_HEADERS } },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 8,
  },
  // Lưu trong DB để mọi instance (Vercel serverless / nhiều container) dùng chung bộ đếm.
  // Nhân viên cùng cửa hàng thường chung 1 IP → nới giới hạn đăng nhập: 10 lần / 60 giây / IP
  // (cộng thêm 10 lần / 10 phút / tài khoản ở `authBeforeHook`).
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
    },
  },
  session: {
    expiresIn: 60 * 60 * 12, // 12 giờ
    updateAge: 60 * 60,
  },
  user: {
    additionalFields: {
      role: { type: "string", input: false },
      locale: { type: "string", input: false },
      active: { type: "boolean", input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Không có đường tạo user qua API ở instance này (nhân viên/CTV tạo bằng Prisma) — chặn hẳn để chắc chắn.
        async before() {
          throw APIError.from("FORBIDDEN", { message: "Không được tự đăng ký", code: NOT_STAFF });
        },
      },
    },
    session: {
      create: {
        // Chỉ nhân viên + CTV; tài khoản bị khoá (P8) không tạo được phiên mới → đăng nhập bị từ chối.
        async before(session) {
          const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { role: true, active: true } });
          const decision = staffSessionDecision(user);
          if (decision === "inactive") throw APIError.from("FORBIDDEN", { message: "Tài khoản đã bị khoá", code: USER_INACTIVE });
          if (decision !== "ok") throw APIError.from("FORBIDDEN", { message: "Sai cổng đăng nhập", code: NOT_STAFF });
        },
      },
    },
  },
  // Giới hạn đăng nhập theo tài khoản + ép mật khẩu nhân viên ≥ MIN_STAFF_PASSWORD khi đổi/đặt lại qua API.
  hooks: { before: authBeforeHook({ staffPasswords: true }) },
  plugins: [nextCookies()],
});
