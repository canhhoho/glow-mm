import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db";

/**
 * Better Auth — chỉ dành cho NHÂN VIÊN (khách hàng định danh bằng SĐT, không đăng nhập).
 * Tự đăng ký bị tắt; admin tạo tài khoản nhân viên.
 */
export const auth = betterAuth({
  baseURL: process.env.APP_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 8,
  },
  // Lưu trong DB để mọi instance (Vercel serverless / nhiều container) dùng chung bộ đếm.
  // Nhân viên cùng cửa hàng thường chung 1 IP → nới giới hạn đăng nhập: 10 lần / 60 giây / IP.
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
  plugins: [nextCookies()],
});
