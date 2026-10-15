import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ADMIN_LOCALES } from "@/i18n/routing";
import { requireStaff } from "@/server/auth/session";
import { can, type Permission } from "@/server/auth/roles";
import { setAdminLocaleAction, signOutAction } from "@/server/auth/actions";
import { Button } from "@/components/ui/button";

const NAV: { href: string; key: string; permission: Permission }[] = [
  { href: "/admin", key: "dashboard", permission: "dashboard:view" },
  { href: "/admin/orders", key: "orders", permission: "orders:view" },
  { href: "/admin/inventory", key: "inventory", permission: "stock:view" },
  { href: "/admin/shipments", key: "shipments", permission: "shipment:manage" },
  { href: "/admin/products", key: "products", permission: "catalog:manage" },
  { href: "/admin/pricing", key: "pricing", permission: "pricing:manage" },
  { href: "/admin/reports", key: "reports", permission: "reports:view" },
  { href: "/admin/users", key: "users", permission: "users:manage" },
  { href: "/admin/settings", key: "settings", permission: "settings:manage" },
];

export default async function PanelLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireStaff();
  const t = await getTranslations("Nav");
  const locale = await getLocale();

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="border-b bg-muted/40 p-3 md:w-56 md:border-r md:border-b-0">
        <div className="mb-3 px-2 font-medium text-primary">Glow VN</div>
        <nav aria-label="Admin">
          <ul className="flex gap-1 overflow-x-auto md:flex-col">
            {NAV.filter((n) => can(user.role, n.permission)).map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="block rounded-md px-2 py-1.5 text-sm whitespace-nowrap hover:bg-muted">
                  {t(n.key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end gap-2 border-b px-4 py-2 text-sm">
          <form action={setAdminLocaleAction} className="flex gap-1" aria-label={t("language")}>
            {ADMIN_LOCALES.map((l) => (
              <Button key={l} name="locale" value={l} size="sm" variant={l === locale ? "secondary" : "ghost"}>
                {l.toUpperCase()}
              </Button>
            ))}
          </form>
          <span className="text-muted-foreground">{user.name}</span>
          <form action={signOutAction}>
            <Button size="sm" variant="outline">
              {t("logout")}
            </Button>
          </form>
        </header>
        <main className="flex-1 p-4">{children}</main>
      </div>
    </div>
  );
}
