import { defineRouting } from "next-intl/routing";

/**
 * Storefront: tiếng Myanmar mặc định + tiếng Anh; tiếng Việt (P22) là lựa chọn thêm, xếp cuối.
 * Locale nằm trong URL. Thứ tự này = thứ tự trong menu ngôn ngữ.
 */
export const routing = defineRouting({
  locales: ["my", "en", "vi"],
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

/** Cổng CTV (/ctv, P10): cùng bộ ngôn ngữ + file messages admin, cookie riêng, mặc định tiếng Myanmar. */
export const CTV_DEFAULT_LOCALE: AdminLocale = "my";
export const CTV_LOCALE_COOKIE = "CTV_LOCALE";
/** Header proxy gắn cho request /ctv để request.ts biết đang ở cổng CTV. */
export const PORTAL_HEADER = "x-glow-portal";
