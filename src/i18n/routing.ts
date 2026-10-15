import { defineRouting } from "next-intl/routing";

/** Storefront: tiếng Myanmar mặc định + tiếng Anh, locale nằm trong URL. */
export const routing = defineRouting({
  locales: ["my", "en"],
  defaultLocale: "my",
  localePrefix: "as-needed",
  // Không tự đổi theo ngôn ngữ trình duyệt: khách Myanmar hay để máy tiếng Anh nhưng đọc tiếng Myanmar.
  localeDetection: false,
});

export type StoreLocale = (typeof routing.locales)[number];

/** Admin: locale theo cookie (không nằm trong URL). */
export const ADMIN_LOCALES = ["vi", "en", "my"] as const;
export type AdminLocale = (typeof ADMIN_LOCALES)[number];
export const ADMIN_DEFAULT_LOCALE: AdminLocale = "vi";
export const ADMIN_LOCALE_COOKIE = "ADMIN_LOCALE";
