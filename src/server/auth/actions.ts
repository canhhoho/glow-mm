"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAPIError } from "better-auth/api";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { confirmPasswordSchema, currentPasswordSchema, newPasswordSchema, withConfirm } from "@/lib/schemas";
import { prisma } from "@/lib/db";
import { ADMIN_LOCALE_COOKIE, ADMIN_LOCALES, CTV_LOCALE_COOKIE } from "@/i18n/routing";
import type { ActionState } from "@/server/inventory/actions";
import { auth } from "./auth";
import { MIN_STAFF_PASSWORD } from "./roles";
import { getAffiliateUser, getStaffUser } from "./session";

export async function signOutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/admin/login");
}

export async function ctvSignOutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/ctv/login");
}

async function setLocaleCookie(formData: FormData, name: string, path: string) {
  const locale = String(formData.get("locale"));
  if (!(ADMIN_LOCALES as readonly string[]).includes(locale)) return;
  (await cookies()).set(name, locale, { path, maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}

export async function setAdminLocaleAction(formData: FormData) {
  await setLocaleCookie(formData, ADMIN_LOCALE_COOKIE, "/admin");
}

/** Ngôn ngữ cổng CTV (P10) — cookie riêng, không đụng ngôn ngữ admin. */
export async function setCtvLocaleAction(formData: FormData) {
  await setLocaleCookie(formData, CTV_LOCALE_COOKIE, "/ctv");
}

const changePasswordSchema = withConfirm(
  z.object({
    currentPassword: currentPasswordSchema,
    newPassword: newPasswordSchema(MIN_STAFF_PASSWORD),
    confirmPassword: confirmPasswordSchema,
  }),
  "newPassword",
).refine((d) => d.newPassword !== d.currentPassword, { path: ["newPassword"], message: "same" });

/** Nhân viên hoặc CTV tự đổi mật khẩu; đăng xuất mọi phiên khác (thiết bị khác). */
export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = (await getStaffUser()) ?? (await getAffiliateUser());
  if (!user) redirect("/admin/login");
  const t = await getTranslations("Account");
  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue.message === "mismatch") return { error: t("errors.mismatch") };
    if (issue.message === "same") return { error: t("errors.same") };
    if (issue.path[0] === "newPassword") return { error: t("errors.tooShort", { min: MIN_STAFF_PASSWORD }) };
    return { error: t("errors.invalid") };
  }
  try {
    const h = await headers();
    // Không dùng `revokeOtherSessions: true`: tuỳ chọn đó xoá cả phiên hiện tại và cấp token mới,
    // còn lần render lại trong cùng request vẫn đọc cookie cũ → bị đẩy về trang đăng nhập.
    await auth.api.changePassword({
      headers: h,
      body: { currentPassword: parsed.data.currentPassword, newPassword: parsed.data.newPassword },
    });
    await auth.api.revokeOtherSessions({ headers: h });
  } catch (e) {
    if (isAPIError(e) && e.body?.code === "INVALID_PASSWORD") return { error: t("errors.wrongCurrent") };
    return { error: e instanceof Error ? e.message : String(e) };
  }
  await prisma.auditLog.create({ data: { userId: user.id, action: "user.changePassword", entity: "User", entityId: user.id } });
  return { ok: "changed" };
}
