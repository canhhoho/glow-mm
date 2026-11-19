import { routing } from "@/i18n/routing";

/**
 * URL gốc của storefront cho metadata (canonical, hreflang, Open Graph, sitemap).
 * Đọc thẳng `APP_URL` (không qua `env()` vì lúc build Docker chưa có secret) — Docker truyền qua build arg.
 * Không có thì dùng localhost (dev/test).
 */
export function siteUrl(): string {
  const raw = process.env.APP_URL?.trim();
  return (raw && /^https?:\/\//.test(raw) ? raw : "http://localhost:3000").replace(/\/+$/, "");
}

/** Đường dẫn công khai theo locale (`my` mặc định không có tiền tố — localePrefix "as-needed"). */
export function localizedPath(locale: string, path: string): string {
  const clean = path === "/" ? "" : path.replace(/\/+$/, "");
  return locale === routing.defaultLocale ? clean || "/" : `/${locale}${clean}`;
}

/** Tiền tố URL của locale: "" (my mặc định) hoặc "/en", "/vi"; locale lạ → "" (an toàn khi ghép vào redirect). */
export function localePrefix(locale: string): string {
  return locale !== routing.defaultLocale && (routing.locales as readonly string[]).includes(locale) ? `/${locale}` : "";
}

/** Biến URL tương đối (ảnh /api/files/..., đường dẫn trang) thành tuyệt đối theo siteUrl(). */
export function absoluteUrl(pathOrUrl: string): string {
  return /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : `${siteUrl()}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

/** canonical + hreflang (my, en, vi, x-default = my) cho một trang storefront. */
export function alternates(locale: string, path: string) {
  return {
    canonical: localizedPath(locale, path),
    languages: {
      ...Object.fromEntries(routing.locales.map((l) => [l, localizedPath(l, path)])),
      "x-default": localizedPath(routing.defaultLocale, path),
    },
  };
}

/** Locale Open Graph theo locale storefront. */
export function ogLocale(locale: string): string {
  return locale === "en" ? "en_US" : locale === "vi" ? "vi_VN" : "my_MM";
}
