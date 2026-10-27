"use server";

import { refresh } from "next/cache";
import { cookies, headers } from "next/headers";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { isAPIError } from "better-auth/api";
import { z, ZodError } from "zod";
import { redirect } from "@/i18n/navigation";
import { routing, type StoreLocale } from "@/i18n/routing";
import { prisma } from "@/lib/db";
import { customerAuth } from "@/server/auth/customer-auth";
import { requireCustomer } from "@/server/auth/customer-session";
import { ORDERS_COOKIE } from "@/server/cart/cart";
import type { StoreActionState } from "@/server/cart/actions";
import { AccountError, createAddress, deleteAddress, setDefaultAddress, updateAddress, updateProfile } from "./accounts";

/** Server Action khu tài khoản khách (P14b). `requireCustomer` → userId lấy từ phiên, không từ form. */

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
    zoneId: formData.get("zoneId"),
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
