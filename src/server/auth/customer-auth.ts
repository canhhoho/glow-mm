import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { phoneNumber } from "better-auth/plugins/phone-number";
import { APIError } from "better-auth/api";
import { prisma } from "@/lib/db";
import { BRAND_NAME } from "@/lib/brand";
import { toUnicode } from "@/lib/myanmar";
import { claimOrders } from "@/server/accounts/claims";
import { authEmail, type AuthEmailKind } from "@/server/accounts/emails";
import { email } from "@/server/adapters/email";
import { ORDERS_COOKIE, parseOrderAccess } from "@/server/cart/cart";
import { normalizeMmPhone } from "@/server/orders/pricing";
import { USER_INACTIVE } from "./roles";
import {
  CUSTOMER_AUTH_BASE_PATH,
  CUSTOMER_COOKIE_PREFIX,
  CUSTOMER_ROLE,
  customerIdentityDecision,
  customerSessionDecision,
  decodeCookieValue,
  deriveCustomerSecret,
  isPhoneEmail,
  localeFromCallback,
  NOT_CUSTOMER,
  STOREFRONT_ROLES,
} from "./customer-policy";

/**
 * Better Auth cho KHÁCH HÀNG storefront (P14) — instance riêng, tách khỏi nhân viên/CTV (`auth.ts`):
 * đường dẫn /api/customer-auth, cookie tiền tố `glow-customer`, secret suy ra riêng, phiên 30 ngày, bảng rate limit riêng.
 * Dùng chung bảng user/session/account/verification; hook bảo đảm chỉ khách (CUSTOMER) và CTV (AFFILIATE) tạo được
 * phiên ở đây — CTV mua/đặt hộ trên storefront bằng chính tài khoản CTV (email/mật khẩu hoặc Google cùng email).
 * Đăng ký/đăng nhập email chỉ bật khi gửi được email (EMAIL_DRIVER ≠ none); Google chỉ bật khi có GOOGLE_CLIENT_ID/SECRET.
 */

const emailOn = process.env.EMAIL_DRIVER === "outbox" || process.env.EMAIL_DRIVER === "resend";
const googleId = process.env.GOOGLE_CLIENT_ID;
const googleSecret = process.env.GOOGLE_CLIENT_SECRET;

/** Gửi email xác minh / đặt lại mật khẩu — chỉ cho khách + CTV (instance này không bao giờ gửi link cho nhân viên). */
async function sendAuthEmail(kind: AuthEmailKind, userId: string, url: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true, locale: true, role: true } });
  // Tài khoản SĐT (P17) chỉ có email nội bộ → không gửi.
  if (!u || !STOREFRONT_ROLES.includes(u.role) || isPhoneEmail(u.email)) return;
  await (await email()).send(authEmail(kind, u, url));
}

export const customerAuth = betterAuth({
  appName: BRAND_NAME,
  baseURL: process.env.APP_URL,
  basePath: CUSTOMER_AUTH_BASE_PATH,
  secret: deriveCustomerSecret(process.env.BETTER_AUTH_SECRET ?? ""),
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  advanced: { cookiePrefix: CUSTOMER_COOKIE_PREFIX },
  emailAndPassword: {
    enabled: emailOn,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    requireEmailVerification: true,
    autoSignIn: false,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: ({ user, url }) => sendAuthEmail("reset", user.id, url),
    // Đăng ký trùng email trả user giả (chống dò email) — phải có đủ field bổ sung như user thật.
    customSyntheticUser: ({ coreFields, additionalFields, id }) => ({
      ...coreFields,
      role: CUSTOMER_ROLE,
      locale: "my",
      active: true,
      ...additionalFields,
      id,
    }),
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: ({ user, url }) => sendAuthEmail("verify", user.id, url),
  },
  socialProviders:
    googleId && googleSecret ? { google: { clientId: googleId, clientSecret: googleSecret, prompt: "select_account" } } : {},
  // Liên kết Google vào tài khoản email đã xác minh của chính khách; tài khoản nhân viên/CTV bị chặn ở validateUserInfo.
  account: { accountLinking: { enabled: true } },
  // Khách Myanmar thường dùng chung IP (mạng di động CGNAT) → nới hơn nhân viên.
  rateLimit: {
    enabled: true,
    storage: "database",
    modelName: "customerRateLimit",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 20 },
      "/sign-up/email": { window: 300, max: 10 },
      "/request-password-reset": { window: 600, max: 5 },
      "/send-verification-email": { window: 600, max: 5 },
      "/sign-in/social": { window: 60, max: 30 },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 ngày
    updateAge: 60 * 60 * 24,
  },
  user: {
    additionalFields: {
      role: { type: "string", input: false },
      locale: { type: "string", input: false },
      active: { type: "boolean", input: false },
    },
    async validateUserInfo({ user, source }) {
      const existing = user.id
        ? await prisma.user.findUnique({ where: { id: String(user.id) }, select: { role: true } })
        : null;
      return customerIdentityDecision(source.action, existing?.role ?? null);
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Mọi user tạo qua instance này là khách — client không gửi được role (input: false), hook ép thêm lần nữa.
        // Bỏ SĐT client gửi kèm (vd đăng ký email kèm phoneNumber của người khác): tài khoản SĐT chỉ tạo qua
        // `registerPhoneCustomer` (P17), không qua API Better Auth.
        async before(user, ctx) {
          const body = ctx?.body as { callbackURL?: unknown } | undefined;
          return {
            data: {
              ...user,
              // Better Auth gộp kết quả hook vào dữ liệu gốc → phải ghi đè null, không xoá khoá được.
              phoneNumber: null,
              phoneNumberVerified: false,
              name: toUnicode(String(user.name ?? "")).trim(),
              role: CUSTOMER_ROLE,
              active: true,
              locale: localeFromCallback(body?.callbackURL),
            },
          };
        },
      },
    },
    session: {
      create: {
        async before(session) {
          const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { role: true, active: true } });
          const decision = customerSessionDecision(user);
          if (decision === "inactive") throw APIError.from("FORBIDDEN", { message: "Tài khoản đã bị khoá", code: USER_INACTIVE });
          if (decision !== "ok") throw APIError.from("FORBIDDEN", { message: "Không phải tài khoản khách hàng", code: NOT_CUSTOMER });
        },
        // Đơn khách đã đặt/tra cứu trên trình duyệt này (mã + SĐT) → gắn vào tài khoản khi đăng nhập.
        async after(session, ctx) {
          const entries = parseOrderAccess(decodeCookieValue(ctx?.getCookie?.(ORDERS_COOKIE)));
          if (entries.length) await claimOrders(session.userId, entries).catch((e) => console.error("claimOrders", e));
        },
      },
    },
  },
  // Không OTP: chỉ dùng đường đăng nhập SĐT + mật khẩu; các endpoint gửi/xác minh/đặt lại bằng OTP bị tắt.
  disabledPaths: [
    "/phone-number/send-otp",
    "/phone-number/verify",
    "/phone-number/request-password-reset",
    "/phone-number/reset-password",
  ],
  plugins: [
    phoneNumber({
      requireVerification: false,
      phoneNumberValidator: (p) => normalizeMmPhone(p) === p,
      sendOTP: () => {
        throw new Error("Chưa hỗ trợ OTP qua SMS");
      },
    }),
    nextCookies(),
  ],
});
