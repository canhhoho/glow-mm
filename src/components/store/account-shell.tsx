import { LogOut } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { PILL_NAV, pillNavItem } from "@/components/ui/pill-nav";
import { signOutCustomerAction } from "@/server/accounts/actions";
import type { CustomerUser } from "@/server/auth/customer-session";

const TABS = [
  { key: "orders", href: "/account" },
  { key: "addresses", href: "/account/addresses" },
  { key: "profile", href: "/account/profile" },
] as const;

/** Khung khu tài khoản khách (P14b): lời chào + tab (đơn / địa chỉ / hồ sơ) + đăng xuất. Không cần JS. */
export async function AccountShell({
  user,
  locale,
  active,
  children,
}: {
  user: CustomerUser;
  locale: string;
  active: (typeof TABS)[number]["key"];
  children: React.ReactNode;
}) {
  const t = await getTranslations({ locale, namespace: "Account" });
  return (
    <div className="mx-auto max-w-screen-md space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-medium">{t("title")}</h1>
          <p className="text-sm break-words text-muted-foreground" data-testid="account-hello">
            {t("hello", { name: user.name })} · {user.contact}
          </p>
        </div>
        <form action={signOutCustomerAction}>
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className="inline-flex min-h-11 shrink-0 items-center gap-1.5 px-1 text-sm text-muted-foreground hover:text-foreground">
            <LogOut className="size-4" aria-hidden />
            {t("signOut")}
          </button>
        </form>
      </div>
      <nav aria-label={t("title")} className={cn(PILL_NAV.list, "overflow-x-auto")}>
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={tab.key === active ? "page" : undefined}
            className={pillNavItem(tab.key === active, "min-h-11 flex-1")}
          >
            {t(`nav.${tab.key}`)}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
