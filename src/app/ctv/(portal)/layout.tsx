import { getLocale, getTranslations } from "next-intl/server";
import { ADMIN_LOCALES } from "@/i18n/routing";
import { requireAffiliate } from "@/server/auth/session";
import { ctvSignOutAction, setCtvLocaleAction } from "@/server/auth/actions";
import { CtvNav } from "@/components/ctv/ctv-nav";
import { Button } from "@/components/ui/button";

/** Khung cổng CTV (P10c): chỉ CTV đang hoạt động; mobile trước, tab ngang. */
export default async function CtvPortalLayout({ children }: LayoutProps<"/ctv">) {
  const user = await requireAffiliate();
  const [t, tNav, locale] = await Promise.all([getTranslations("Ctv"), getTranslations("Nav"), getLocale()]);
  const items = (["home", "orders", "newOrder", "payouts", "account"] as const).map((k) => ({
    href: { home: "/ctv", orders: "/ctv/orders", newOrder: "/ctv/orders/new", payouts: "/ctv/payouts", account: "/ctv/account" }[k],
    label: t(`nav.${k}`),
  }));

  return (
    <div data-theme="store" className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-2">
          <div className="grid size-8 place-items-center rounded-lg bg-brand text-sm font-bold text-brand-foreground">G</div>
          <div className="min-w-0 leading-tight">
            <div className="text-sm font-semibold">Glow VN</div>
            <div className="truncate text-xs text-muted-foreground" data-testid="ctv-user">
              {user.name} · {user.code}
            </div>
          </div>
          <form action={setCtvLocaleAction} className="ml-auto flex gap-0.5" aria-label={tNav("language")}>
            {ADMIN_LOCALES.map((l) => (
              <Button key={l} type="submit" name="locale" value={l} size="sm" variant={l === locale ? "secondary" : "ghost"}>
                {l.toUpperCase()}
              </Button>
            ))}
          </form>
          <form action={ctvSignOutAction}>
            <Button type="submit" size="sm" variant="outline">
              {t("logout")}
            </Button>
          </form>
        </div>
        <div className="mx-auto max-w-4xl px-4 pb-2">
          <CtvNav items={items} />
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-5">{children}</main>
    </div>
  );
}
