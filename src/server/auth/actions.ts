"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAPIError } from "better-auth/api";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ADMIN_LOCALE_COOKIE, ADMIN_LOCALES } from "@/i18n/routing";
import type { ActionState } from "@/server/inventory/actions";
import { auth } from "./auth";
import { MIN_STAFF_PASSWORD } from "./roles";
import { requireStaff } from "./session";

export async function signOutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/admin/login");
}

export async function setAdminLocaleAction(formData: FormData) {
  const locale = String(formData.get("locale"));
  if (!(ADMIN_LOCALES as readonly string[]).includes(locale)) return;
  (await cookies()).set(ADMIN_LOCALE_COOKIE, locale, {
    path: "/admin",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(MIN_STAFF_PASSWORD).max(128),
    confirmPassword: z.string().max(128),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { path: ["confirmPassword"], message: "mismatch" })
  .refine((d) => d.newPassword !== d.currentPassword, { path: ["newPassword"], message: "same" });

/** Nhân viên tự đổi mật khẩu; đăng xuất mọi phiên khác (thiết bị khác). */
export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireStaff();
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
