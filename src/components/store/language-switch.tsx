"use client";

import { useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";
import type { StoreLocale } from "@/i18n/routing";
import { switchLocaleInPath } from "@/lib/localize-path";

const noop = () => () => {};

/**
 * Một mục trong menu ngôn ngữ: giữ nguyên trang đang xem (kể cả query, vd `?q=`).
 * Nếu query có `next=` (đích chuyển tiếp nội bộ), đổi tiền tố ngôn ngữ của `next` theo ngôn ngữ đích.
 * Đọc URL → phải nằm trong <Suspense>; fallback là link về trang chủ (chạy cả khi chưa tải JS).
 * Lúc hydrate vẫn dùng "/" như server rồi mới đổi: trang 404 do proxy rewrite có pathname phía server khác URL
 * trình duyệt (tránh lệch hydrate).
 */
export function LanguageSwitch({ to, name, current, className }: { to: StoreLocale; name: string; current: boolean; className: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hydrated = useSyncExternalStore(noop, () => true, () => false);

  let search = searchParams.toString();
  if (hydrated && searchParams.has("next")) {
    const rawNext = searchParams.get("next");
    if (rawNext) {
      const switched = switchLocaleInPath(rawNext, to);
      const params = new URLSearchParams(searchParams.toString());
      if (switched) {
        params.set("next", switched);
      } else {
        params.delete("next");
      }
      search = params.toString();
    }
  }

  const href = !hydrated ? "/" : search ? `${pathname}?${search}` : pathname;
  return (
    <Link href={href} locale={to} lang={to} hrefLang={to} aria-current={current ? "true" : undefined} className={className}>
      {name}
    </Link>
  );
}
