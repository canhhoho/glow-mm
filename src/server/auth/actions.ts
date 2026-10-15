"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_LOCALE_COOKIE, ADMIN_LOCALES } from "@/i18n/routing";
import { auth } from "./auth";

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
