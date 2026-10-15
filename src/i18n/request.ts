import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import {
  ADMIN_DEFAULT_LOCALE,
  ADMIN_LOCALE_COOKIE,
  ADMIN_LOCALES,
  type AdminLocale,
  routing,
} from "./routing";

/**
 * - Storefront: locale lấy từ segment [locale] → messages/store.<locale>.json
 * - Admin (không có segment locale): lấy từ cookie → messages/admin.<locale>.json
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;

  if (requested && hasLocale(routing.locales, requested)) {
    return {
      locale: requested,
      messages: (await import(`../../messages/store.${requested}.json`)).default,
    };
  }

  const fromCookie = (await cookies()).get(ADMIN_LOCALE_COOKIE)?.value;
  const locale: AdminLocale = hasLocale(ADMIN_LOCALES, fromCookie) ? fromCookie : ADMIN_DEFAULT_LOCALE;
  return {
    locale,
    timeZone: locale === "vi" ? "Asia/Ho_Chi_Minh" : "Asia/Yangon",
    messages: (await import(`../../messages/admin.${locale}.json`)).default,
  };
});
