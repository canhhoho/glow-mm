import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { UserRound } from "lucide-react";
import { requireAffiliate } from "@/server/auth/session";
import { CtvNav } from "@/components/ctv/ctv-nav";
import { CtvLocaleSwitch, CtvSignOut } from "@/components/ctv/ctv-session-controls";

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
    <div data-theme="store" className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-2">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand text-sm font-bold text-brand-foreground">G</div>
          <div className="min-w-0 leading-tight">
            <div className="text-sm font-semibold">Glow VN</div>
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
        <div className="mx-auto hidden max-w-4xl px-4 pb-2 md:block">
          <CtvNav items={items} />
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 pt-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-5">{children}</main>
      {/* Ngoài <header>: backdrop-blur của header làm `fixed` bên trong bám theo header thay vì màn hình. */}
      <CtvNav items={items.filter((i) => i.href !== "/ctv/account")} variant="bottom" />
    </div>
  );
}
