"use client";

import { useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";
import type { StoreLocale } from "@/i18n/routing";

const noop = () => () => {};

/**
 * Nút đổi ngôn ngữ giữ nguyên trang đang xem (kể cả query, vd `?q=`).
 * Đọc URL → phải nằm trong <Suspense>; fallback là link về trang chủ (chạy cả khi chưa tải JS).
 * Lúc hydrate vẫn dùng "/" như server rồi mới đổi: trang 404 do proxy rewrite có pathname phía server khác URL
 * trình duyệt (tránh lệch hydrate).
 */

export function LanguageSwitch({ to, label, className }: { to: StoreLocale; label: string; className: string }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const href = !hydrated ? "/" : search ? `${pathname}?${search}` : pathname;
  return (
    <Link href={href} locale={to} lang={to} className={className} aria-label={label} data-testid="language-switch">
      {to === "my" ? "မြန်မာ" : "EN"}
    </Link>
  );
}
