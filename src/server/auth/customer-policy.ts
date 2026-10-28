/**
 * Quy tắc tách tài khoản khách (P14) khỏi nhân viên/CTV — hàm thuần, không import Next/Prisma để unit test.
 * Hai instance Better Auth dùng chung bảng user/session: mỗi instance chỉ cho tạo phiên với role của mình.
 */
import { createHmac } from "node:crypto";
import { AFFILIATE_ROLE, NOT_STAFF, ROLES } from "./roles";

export { NOT_STAFF };

export const CUSTOMER_ROLE = "CUSTOMER";
/** Role được đăng nhập storefront: khách + CTV (CTV mua cho mình / đặt hộ khách, đơn tính hoa hồng cho CTV). Nhân viên thì không. */
export const STOREFRONT_ROLES: readonly string[] = [CUSTOMER_ROLE, AFFILIATE_ROLE];
export const CUSTOMER_AUTH_BASE_PATH = "/api/customer-auth";
export const CUSTOMER_COOKIE_PREFIX = "glow-customer";
/** Mã lỗi trả về client (trang đăng nhập khách / staff map sang chuỗi giao diện). */
export const NOT_CUSTOMER = "NOT_CUSTOMER";

type SessionUser = { role: string; active: boolean } | null | undefined;
export type SessionDecision = "ok" | "inactive" | "forbidden";

/** Instance nhân viên (/api/auth): chỉ nhân viên + CTV. */
export function staffSessionDecision(user: SessionUser): SessionDecision {
  if (!user) return "forbidden";
  if (!(ROLES as readonly string[]).includes(user.role) && user.role !== AFFILIATE_ROLE) return "forbidden";
  return user.active ? "ok" : "inactive";
}

/** Instance khách (/api/customer-auth): khách + CTV, không nhân viên. */
export function customerSessionDecision(user: SessionUser): SessionDecision {
  if (!user || !STOREFRONT_ROLES.includes(user.role)) return "forbidden";
  return user.active ? "ok" : "inactive";
}

/**
 * Gate `user.validateUserInfo` của instance khách: tạo user mới luôn được (hook ép role CUSTOMER);
 * liên kết Google / đăng nhập lại vào user đã có chỉ khi user đó là khách hoặc CTV — chặn Google cùng email chiếm
 * tài khoản nhân viên (nhân viên có emailVerified=true nên Better Auth sẽ tự liên kết nếu không chặn).
 */
export function customerIdentityDecision(action: string, existingRole: string | null): { error: string } | undefined {
  if (action === "create-user") return undefined;
  return existingRole && STOREFRONT_ROLES.includes(existingRole) ? undefined : { error: NOT_CUSTOMER };
}

/** Email nội bộ của tài khoản SĐT (P17) — tên miền `.invalid` không bao giờ nhận mail. */
export const PHONE_EMAIL_DOMAIN = "phone.glow.invalid";
export const phoneEmail = (phone: string) => `${phone}@${PHONE_EMAIL_DOMAIN}`;
export const isPhoneEmail = (email: string) => email.toLowerCase().endsWith(`@${PHONE_EMAIL_DOMAIN}`);

/** Secret riêng cho instance khách (suy ra từ BETTER_AUTH_SECRET) → token phiên chép sang cookie bên kia không hợp lệ. */
export function deriveCustomerSecret(secret: string): string {
  return createHmac("sha256", secret).update("glow-customer-auth").digest("hex");
}

/** Ngôn ngữ của khách khi tạo tài khoản, đoán từ callbackURL (storefront: /en/... = en, còn lại my). */
export function localeFromCallback(callbackURL: unknown): "my" | "en" {
  if (typeof callbackURL !== "string") return "my";
  let path = callbackURL;
  try {
    path = new URL(callbackURL, "http://x").pathname;
  } catch {
    return "my";
  }
  return path === "/en" || path.startsWith("/en/") ? "en" : "my";
}

/** `?next=` chỉ nhận đường dẫn nội bộ (chống open redirect); sai → fallback. */
export function safeNextPath(raw: unknown, fallback = "/account"): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  return raw;
}

/** Giá trị cookie có thể đã được encodeURIComponent (Next `cookies().set`). */
export function decodeCookieValue(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    return raw.startsWith("%") ? decodeURIComponent(raw) : raw;
  } catch {
    return null;
  }
}

/** Mã lỗi Better Auth gắn vào `?error=` khi chuyển về trang đăng nhập (Google, link xác minh) → khoá chuỗi `Auth.err.*`. */
export function authRedirectErrorKey(code: string): string {
  switch (code) {
    case "account_not_linked":
      return "notLinked";
    case NOT_CUSTOMER:
      return "notCustomer";
    case "USER_INACTIVE":
      return "locked";
    case "TOKEN_EXPIRED":
    case "INVALID_TOKEN":
    case "invalid_token":
      return "invalidLink";
    default:
      return "unknown";
  }
}
