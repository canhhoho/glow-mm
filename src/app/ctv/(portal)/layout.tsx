import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { UserRound } from "lucide-react";
import { requireAffiliate } from "@/server/auth/session";
import { CtvNav } from "@/components/ctv/ctv-nav";
import { CtvLocaleSwitch, CtvSignOut } from "@/components/ctv/ctv-session-controls";
import { BRAND_MARK, BRAND_NAME } from "@/lib/brand";

/**
 * Một khung chiều rộng + lề cho header, thanh mục và thân trang (19/11/2026): trước đây cả ba bị khoá `max-w-4xl` (896px)
 * nên màn hình rộng chỉ dùng một dải giữa. Lề tăng dần theo viewport; trần 96rem (1536px) để dòng bảng không quá dài.
 * Trang dạng form (Tài khoản, Tạo đơn) tự giữ độ rộng đọc được bằng `Page width="narrow"` / `max-w-*` ở chính trang.
 */
const CONTAINER = "mx-auto w-full max-w-[96rem] px-4 sm:px-6 lg:px-8";

/**
 * Khung cổng CTV (P10c): chỉ CTV đang hoạt động. Mobile: thanh mục ở đáy + nút Tài khoản trên header
 * (ngôn ngữ, đăng xuất nằm trong trang Tài khoản); desktop: tab ngang + ngôn ngữ, đăng xuất trên header.
 */
export default async function CtvPortalLayout({ children }: LayoutProps<"/ctv">) {
  const user = await requireAffiliate();
  const t = await getTranslations("Ctv");
  const items = (["home", "orders", "newOrder", "team", "payouts", "account"] as const).map((k) => ({
    href: {
      home: "/ctv",
      orders: "/ctv/orders",
      newOrder: "/ctv/orders/new",
      team: "/ctv/team",
      payouts: "/ctv/payouts",
      account: "/ctv/account",
    }[k],
    label: t(`nav.${k}`),
  }));

  return (
    // 18/11/2026: dùng màu + thành phần admin (bỏ theme storefront); khung CTV (header, thanh mục đáy) giữ nguyên.
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
        <div className={`${CONTAINER} flex items-center gap-2 py-2`}>
          <div className="grid h-8 min-w-8 shrink-0 place-items-center rounded-lg bg-brand px-1 text-[11px] font-bold text-brand-foreground">{BRAND_MARK}</div>
          <div className="min-w-0 leading-tight">
            <div className="text-sm font-semibold">{BRAND_NAME}</div>
            <div className="truncate text-xs text-muted-foreground" data-testid="ctv-user">
              {user.name} · {user.code}
            </div>
          </div>
          <CtvLocaleSwitch className="ml-auto hidden md:flex" />
          <CtvSignOut className="hidden md:block" />
          <Link
            href="/ctv/account"
            aria-label={t("nav.account")}
            data-testid="ctv-account-link"
            className="ml-auto grid size-10 shrink-0 place-items-center rounded-full hover:bg-muted md:hidden"
          >
            <UserRound className="size-5" aria-hidden />
          </Link>
        </div>
        <div className={`${CONTAINER} hidden pb-2 md:block`}>
          <CtvNav items={items} />
        </div>
      </header>
      <main className={`${CONTAINER} pt-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-6`}>{children}</main>
      {/* Ngoài <header>: backdrop-blur của header làm `fixed` bên trong bám theo header thay vì màn hình. */}
      <CtvNav items={items.filter((i) => i.href !== "/ctv/account")} variant="bottom" />
    </div>
  );
}
