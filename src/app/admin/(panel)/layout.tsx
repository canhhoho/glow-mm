import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ADMIN_LOCALES } from "@/i18n/routing";
import { requireStaff } from "@/server/auth/session";
import { setAdminLocaleAction, signOutAction } from "@/server/auth/actions";
import { neededCounts, visibleNav, type NavCountKey } from "@/server/admin/nav";
import { navCounts } from "@/server/admin/nav-counts";
import { AdminShell, type ShellGroup, type ShellItem } from "@/components/admin/admin-shell";
import { Button } from "@/components/ui/button";

const BADGE_TONE: Record<NavCountKey, NonNullable<ShellItem["badge"]>["tone"]> = {
  pendingOrders: "brand",
  quarantineLots: "neutral",
  blockedLots: "warning",
};

export default async function PanelLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireStaff();
  const nav = visibleNav(user.role);
  const [t, locale, counts] = await Promise.all([getTranslations("Nav"), getLocale(), navCounts(neededCounts(nav))]);

  const groups: ShellGroup[] = nav.map((g) => ({
    label: g.key ? t(g.key) : null,
    items: g.items.map((i) => {
      const n = i.count ? (counts[i.count] ?? 0) : 0;
      return {
        href: i.href,
        label: t(i.key),
        icon: i.icon,
        badge: i.count && n > 0 ? { n, tone: BADGE_TONE[i.count] } : undefined,
      };
    }),
  }));

  return (
    <AdminShell
      groups={groups}
      labels={{ subtitle: t("subtitle"), menu: t("menu"), close: t("closeMenu"), breadcrumb: t("breadcrumb") }}
      header={
        <>
          <form action={setAdminLocaleAction} className="flex gap-1" aria-label={t("language")}>
            {ADMIN_LOCALES.map((l) => (
              <Button key={l} type="submit" name="locale" value={l} size="sm" variant={l === locale ? "secondary" : "ghost"}>
                {l.toUpperCase()}
              </Button>
            ))}
          </form>
          <Link
            href="/admin/account"
            title={t("account")}
            className="max-w-24 truncate text-muted-foreground hover:underline md:max-w-48"
          >
            {user.name}
          </Link>
          <form action={signOutAction}>
            <Button type="submit" size="sm" variant="outline">
              {t("logout")}
            </Button>
          </form>
        </>
      }
    >
      {children}
    </AdminShell>
  );
}
