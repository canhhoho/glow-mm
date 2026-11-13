import { Suspense } from "react";
import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { ADMIN_LOCALES } from "@/i18n/routing";
import { requireStaff } from "@/server/auth/session";
import { setAdminLocaleAction, signOutAction } from "@/server/auth/actions";
import { neededCounts, visibleNav, type NavCountKey } from "@/server/admin/nav";
import { navCounts } from "@/server/admin/nav-counts";
import { AdminShell, type ShellGroup, type ShellItem } from "@/components/admin/admin-shell";
import { Button } from "@/components/ui/button";
import { TONES } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

const BADGE_TONE: Record<NavCountKey, NonNullable<ShellItem["badge"]>["tone"]> = {
  pendingOrders: "brand",
  awaitingStock: "warning",
  quarantineLots: "neutral",
  blockedLots: "warning",
  pendingApplications: "brand",
  catalogIncomplete: "warning",
  catalogReview: "warning",
  catalogPublished: "success",
};

export default async function PanelLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireStaff();
  const nav = visibleNav(user.role);
  const [t, locale] = await Promise.all([getTranslations("Nav"), getLocale()]);
  const counts = navCounts(neededCounts(nav));

  const groups: ShellGroup[] = nav.map((g) => ({
    label: g.key ? t(g.key) : null,
    icon: g.icon,
    items: g.items.map((i) => {
      return {
        href: i.href,
        label: t(i.key),
        icon: i.icon,
        section: i.section ? t(i.section) : undefined,
        badgeContent: i.count ? <Suspense fallback={null}><NavBadge counts={counts} kind={i.count} /></Suspense> : undefined,
      };
    }),
  }));

  return (
    <AdminShell
      groups={groups}
      labels={{ subtitle: t("subtitle"), menu: t("menu"), close: t("closeMenu"), breadcrumb: t("breadcrumb") }}
      header={
        <>
          <form action={setAdminLocaleAction} className="flex sm:gap-1" aria-label={t("language")}>
            {ADMIN_LOCALES.map((l) => (
              <Button key={l} type="submit" name="locale" value={l} size="sm" variant={l === locale ? "secondary" : "ghost"} aria-pressed={l === locale} lang={l} className="max-sm:px-2">
                {l.toUpperCase()}
              </Button>
            ))}
          </form>
          {/* Điện thoại: chỉ icon (tên chiếm chỗ làm tiêu đề trang bị cắt "Đơn ..."). */}
          <Link
            href="/admin/account"
            title={t("account")}
            aria-label={`${t("account")}: ${user.name}`}
            className="flex min-w-0 items-center text-muted-foreground hover:underline"
          >
            <UserRound className="size-5 sm:hidden" aria-hidden />
            <span className="hidden max-w-24 truncate sm:inline md:max-w-48">{user.name}</span>
          </Link>
          {/* Điện thoại: chỉ icon (chữ sr-only) để tiêu đề trang không bị cắt. */}
          <form action={signOutAction}>
            <Button type="submit" size="sm" variant="outline" title={t("logout")} className="max-sm:size-7 max-sm:px-0">
              <LogOut className="sm:hidden" aria-hidden />
              <span className="max-sm:sr-only">{t("logout")}</span>
            </Button>
          </form>
        </>
      }
    >
      {children}
    </AdminShell>
  );
}

async function NavBadge({ counts, kind }: { counts: ReturnType<typeof navCounts>; kind: NavCountKey }) {
  const n = (await counts)[kind] ?? 0;
  return n > 0 ? <span className={cn("ml-auto rounded-full px-1.5 text-2xs font-medium tabular-nums", TONES[BADGE_TONE[kind]])}>{n}</span> : null;
}
