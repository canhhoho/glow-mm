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
