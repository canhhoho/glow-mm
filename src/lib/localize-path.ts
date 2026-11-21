import { isSafeInternalPath } from "./safe-path";
import { routing, type StoreLocale } from "@/i18n/routing";

/**
 * Tách locale hợp lệ ở đầu pathname (nếu có) và phần path còn lại.
 * Ví dụ:
 * - "/en/checkout" -> { locale: "en", rest: "/checkout" }
 * - "/vi" -> { locale: "vi", rest: "/" }
 * - "/checkout" -> { locale: null, rest: "/checkout" }
 * - "/enterprise" -> { locale: null, rest: "/enterprise" } (không nhầm với /en)
 */
export function extractLocaleAndRest(
  pathname: string,
  locales: readonly string[] = routing.locales,
): { locale: StoreLocale | null; rest: string } {
  const segments = pathname.split("/");
  const first = segments[1];
  if (first && locales.includes(first)) {
    const rest = "/" + segments.slice(2).join("/");
    return { locale: first as StoreLocale, rest: rest.replace(/\/+$/, "") || "/" };
  }
  return { locale: null, rest: pathname.replace(/\/+$/, "") || "/" };
}

/**
 * Đổi tiền tố ngôn ngữ trong một đường dẫn nội bộ (thường từ query `?next=`).
 *
 * An toàn:
 * - Chỉ chấp nhận đường dẫn nội bộ hợp lệ (`isSafeInternalPath`), bắt đầu bằng `/`, không `//`.
 * - Chặn mọi biến thể open redirect (URL ngoài, protocol-relative, bypass ký tự trắng/điều khiển).
 * - Nếu không an toàn, trả về null để caller xử lý (xoá param hoặc fallback).
 *
 * Logic tiền tố theo cấu hình `routing` (defaultLocale = "my", localePrefix = "as-needed"):
 * - targetLocale === defaultLocale ("my"): bỏ tiền tố (`/checkout`)
 * - targetLocale !== defaultLocale ("en", "vi"): thêm tiền tố `/${targetLocale}/...`
 */
export function switchLocaleInPath(path: string, targetLocale: StoreLocale): string | null {
  if (!isSafeInternalPath(path)) return null;

  try {
    const parsed = new URL(path, "http://internal.invalid");
    const { rest } = extractLocaleAndRest(parsed.pathname, routing.locales);
    const normalizedRest = rest.startsWith("/") ? rest : `/${rest}`;

    let newPathname: string;
    if (targetLocale === routing.defaultLocale) {
      newPathname = normalizedRest;
    } else {
      newPathname = normalizedRest === "/" ? `/${targetLocale}` : `/${targetLocale}${normalizedRest}`;
    }

    return `${newPathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}
