"use server";

import { refresh, revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { isAPIError } from "better-auth/api";
import { z, ZodError } from "zod";
import { redirect as nextRedirect } from "next/navigation";
import { redirect } from "@/i18n/navigation";
import { routing, type StoreLocale } from "@/i18n/routing";
import { clientIp } from "@/lib/client-ip";
import { prisma } from "@/lib/db";
import { customerAuth } from "@/server/auth/customer-auth";
import { safeNextPath } from "@/server/auth/customer-policy";
import { requireCustomer } from "@/server/auth/customer-session";
import { requirePermission } from "@/server/auth/session";
import type { ActionState } from "@/server/inventory/actions";
import { normalizeMmPhone } from "@/server/orders/pricing";
import { ORDERS_COOKIE } from "@/server/cart/cart";
import type { StoreActionState } from "@/server/cart/actions";
import { AccountError, createAddress, deleteAddress, setDefaultAddress, updateAddress, updateProfile } from "./accounts";
import { CustomerAccountError, resetCustomerPassword, setCustomerActive } from "./admin";
import { consumePhoneLoginLimit, MIN_CUSTOMER_PASSWORD, PhoneAccountError, registerPhoneCustomer } from "./phone";

/** Server Action khu tài khoản khách (P14b) + đăng ký/đăng nhập bằng SĐT (P17). `requireCustomer` → userId lấy từ phiên. */

/** Mã lỗi SĐT / Better Auth → khoá chuỗi `Auth.err.*`. */
function phoneErrorKey(e: unknown): string {
  if (e instanceof PhoneAccountError) return e.code === "too_many" ? "tooMany" : e.code === "phone_taken" ? "phoneTaken" : "invalidPhone";
  if (e instanceof ZodError) {
    const issue = e.issues[0];
    if (issue?.message === "mismatch") return "mismatch";
    if (issue?.path[0] === "password") return "tooShort";
    return "unknown";
  }
  if (isAPIError(e)) {
    const code = e.body?.code;
    if (code === "USER_INACTIVE") return "locked";
    if (code === "NOT_CUSTOMER") return "notCustomer";
    return "invalidPhoneLogin";
  }
  console.error(e);
  return "unknown";
}

async function signInWithPhone(phone: string, password: string) {
  await customerAuth.api.signInPhoneNumber({ body: { phoneNumber: phone, password }, headers: await headers() });
}

const phoneLoginSchema = z.object({ phone: z.string().trim().min(1).max(30), password: z.string().min(1).max(128) });

/**
 * Đăng nhập SĐT + mật khẩu (gọi trực tiếp từ form đăng nhập — ô nhập không có "@"). Thành công → chuyển tới `next`
 * (đường dẫn nội bộ, đã có tiền tố ngôn ngữ); lỗi → khoá chuỗi `Auth.err.*`.
 */
export async function phoneSignInAction(raw: { phone: string; password: string; next: string; locale: string }): Promise<{ error?: string }> {
  const prefix = raw.locale === "en" ? "/en" : "";
  try {
    const input = phoneLoginSchema.parse(raw);
    const phone = normalizeMmPhone(input.phone);
    if (!phone) return { error: "invalidPhone" };
    await consumePhoneLoginLimit(clientIp(await headers()), phone);
    await signInWithPhone(phone, input.password);
  } catch (e) {
    return { error: phoneErrorKey(e) };
  }
  nextRedirect(safeNextPath(raw.next, `${prefix}/account`));
}

/** Đăng ký bằng SĐT + mật khẩu rồi đăng nhập luôn. */
export async function phoneRegisterAction(_prev: StoreActionState, formData: FormData): Promise<StoreActionState> {
  const locale = localeOf(formData);
  const prefix = locale === "en" ? "/en" : "";
  try {
    const { phone } = await registerPhoneCustomer(
      {
        name: formData.get("name"),
        phone: formData.get("phone"),
        password: formData.get("password"),
        confirmPassword: formData.get("confirmPassword"),
        locale,
      },
      { ip: clientIp(await headers()) },
    );
    await signInWithPhone(phone, String(formData.get("password")));
  } catch (e) {
    return { error: phoneErrorKey(e) };
  }
  nextRedirect(safeNextPath(formData.get("next"), `${prefix}/account`));
}

function localeOf(fd: FormData): StoreLocale {
  const l = fd.get("locale");
  return hasLocale(routing.locales, l) ? l : routing.defaultLocale;
}

async function errorText(e: unknown, locale: StoreLocale): Promise<string> {
  const t = await getTranslations({ locale, namespace: "Account" });
  if (e instanceof AccountError) return t(`err.${e.code}`);
  if (e instanceof ZodError) return t("err.invalid_form");
  console.error(e);
  return t("err.unknown");
}

export async function updateProfileAction(_prev: StoreActionState, formData: FormData): Promise<StoreActionState> {
  const locale = localeOf(formData);
  const user = await requireCustomer(locale, "/account/profile");
  try {
    await updateProfile(user.id, { name: formData.get("name") });
  } catch (e) {
    return { error: await errorText(e, locale) };
  }
  refresh();
  return { ok: true };
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(8).max(128),
    confirmPassword: z.string().max(128),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { path: ["confirmPassword"], message: "mismatch" });

export async function changeCustomerPasswordAction(_prev: StoreActionState, formData: FormData): Promise<StoreActionState> {
  const locale = localeOf(formData);
  const user = await requireCustomer(locale, "/account/profile");
  const t = await getTranslations({ locale, namespace: "Account" });
  const parsed = passwordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue.message === "mismatch") return { error: t("err.mismatch") };
    if (issue.path[0] === "newPassword") return { error: t("err.tooShort", { min: 8 }) };
    return { error: t("err.invalid_form") };
  }
  try {
    const h = await headers();
    // Như cổng nhân viên: không dùng `revokeOtherSessions: true` (đổi token phiên hiện tại giữa request) — thu hồi riêng.
    await customerAuth.api.changePassword({
      headers: h,
      body: { currentPassword: parsed.data.currentPassword, newPassword: parsed.data.newPassword },
    });
    await customerAuth.api.revokeOtherSessions({ headers: h });
  } catch (e) {
    if (isAPIError(e) && e.body?.code === "INVALID_PASSWORD") return { error: t("err.wrongCurrent") };
    return { error: await errorText(e, locale) };
  }
  await prisma.auditLog.create({ data: { userId: user.id, action: "customer.changePassword", entity: "User", entityId: user.id } });
  return { ok: true };
}

/** Đăng xuất + quên các đơn đã nhớ trên trình duyệt (máy dùng chung: người sau không xem/nhận được đơn của mình). */
export async function signOutCustomerAction(formData: FormData) {
  const locale = localeOf(formData);
  await customerAuth.api.signOut({ headers: await headers() });
  (await cookies()).delete(ORDERS_COOKIE);
  redirect({ href: "/", locale });
}

export async function saveAddressAction(_prev: StoreActionState, formData: FormData): Promise<StoreActionState> {
  const locale = localeOf(formData);
  const user = await requireCustomer(locale, "/account/addresses");
  const id = formData.get("id");
  const raw = {
    recipientName: formData.get("recipientName"),
    phone: formData.get("phone"),
    phone2: formData.get("phone2") ?? undefined,
    townshipId: formData.get("townshipId"),
    line: formData.get("line"),
    note: formData.get("note") ?? undefined,
    isDefault: formData.get("isDefault"),
  };
  try {
    if (typeof id === "string" && id) await updateAddress(user.id, id, raw);
    else await createAddress(user.id, raw);
  } catch (e) {
    return { error: await errorText(e, locale) };
  }
  redirect({ href: { pathname: "/account/addresses", query: { saved: "1" } }, locale });
}

export async function setDefaultAddressAction(formData: FormData) {
  const locale = localeOf(formData);
  const user = await requireCustomer(locale, "/account/addresses");
  await setDefaultAddress(user.id, String(formData.get("id") ?? "")).catch(() => {});
  refresh();
}

export async function deleteAddressAction(formData: FormData) {
  const locale = localeOf(formData);
  const user = await requireCustomer(locale, "/account/addresses");
  await deleteAddress(user.id, String(formData.get("id") ?? "")).catch(() => {});
  refresh();
}

// ── Admin: tài khoản khách (P17, quyền users:manage) ──

const adminIdSchema = z.string().min(1);

/** Đặt mật khẩu tạm cho khách (khách SĐT quên mật khẩu nhắn shop) — thu hồi mọi phiên của khách. */
export async function resetCustomerPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations("Customers");
  try {
    const user = await requirePermission("users:manage");
    await resetCustomerPassword(adminIdSchema.parse(formData.get("id")), formData.get("password"), user.id);
  } catch (e) {
    if (e instanceof CustomerAccountError) return { error: t(`err.${e.code}`) };
    if (e instanceof ZodError) return { error: t("err.password", { min: MIN_CUSTOMER_PASSWORD }) };
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/admin/customer-accounts");
  return { ok: t("passwordReset") };
}

export async function setCustomerActiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations("Customers");
  try {
    const user = await requirePermission("users:manage");
    await setCustomerActive(adminIdSchema.parse(formData.get("id")), formData.get("active") === "true", user.id);
  } catch (e) {
    if (e instanceof CustomerAccountError) return { error: t(`err.${e.code}`) };
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/admin/customer-accounts");
  return { ok: t("saved") };
}
