import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import {
  ADMIN_DEFAULT_LOCALE,
  ADMIN_LOCALE_COOKIE,
  ADMIN_LOCALES,
  type AdminLocale,
  CTV_DEFAULT_LOCALE,
  CTV_LOCALE_COOKIE,
  PORTAL_HEADER,
  routing,
} from "./routing";

/**
 * - Storefront: locale lấy từ segment [locale] → messages/store.<locale>.json
 * - Admin (không có segment locale): lấy từ cookie → messages/admin.<locale>.json
 * - Cổng CTV /ctv (proxy gắn header PORTAL_HEADER): cookie riêng, mặc định `my`, cũng dùng messages/admin.<locale>.json
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;

  if (requested && hasLocale(routing.locales, requested)) {
    return {
      locale: requested,
      messages: (await import(`../../messages/store.${requested}.json`)).default,
    };
  }

  const ctv = (await headers()).get(PORTAL_HEADER) === "ctv";
  const fromCookie = (await cookies()).get(ctv ? CTV_LOCALE_COOKIE : ADMIN_LOCALE_COOKIE)?.value;
  const fallback = ctv ? CTV_DEFAULT_LOCALE : ADMIN_DEFAULT_LOCALE;
  const locale: AdminLocale = hasLocale(ADMIN_LOCALES, fromCookie) ? fromCookie : fallback;
  return {
    locale,
    timeZone: locale === "vi" ? "Asia/Ho_Chi_Minh" : "Asia/Yangon",
    messages: (await import(`../../messages/admin.${locale}.json`)).default,
  };
});
