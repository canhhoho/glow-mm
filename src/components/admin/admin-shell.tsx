"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ChartColumn,
  ChevronRight,
  Coins,
  FileText,
  Handshake,
  Folder,
  House,
  Image,
  Layers,
  MapPinned,
  Menu,
  Package,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Star,
  Tag,
  Truck,
  UserRound,
  Users,
  Warehouse,
  X,
  type LucideIcon,
} from "lucide-react";
import { activeHref, type NavIcon } from "@/server/admin/nav";
import { TONES } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { BRAND_MARK, BRAND_NAME } from "@/lib/brand";

const ICONS: Record<NavIcon, LucideIcon> = {
  home: House,
  cart: ShoppingCart,
  star: Star,
  box: Package,
  file: FileText,
  shield: ShieldCheck,
  truck: Truck,
  bell: Bell,
  tag: Tag,
  folder: Folder,
  coins: Coins,
  image: Image,
  layers: Layers,
  chart: ChartColumn,
  users: Users,
  handshake: Handshake,
  userCircle: UserRound,
  map: MapPinned,
  warehouse: Warehouse,
  gear: Settings,
};

export type ShellItem = {
  href: string;
  label: string;
  icon: NavIcon;
  badge?: { n: number; tone: "brand" | "neutral" | "warning" };
  /** Nội dung server stream riêng, không để số đếm chặn cả khung điều hướng. */
  badgeContent?: React.ReactNode;
};
export type ShellGroup = { label: string | null; items: ShellItem[] };

/**
 * Khung admin (P9a): menu nhóm + icon + badge, đánh dấu trang đang mở, breadcrumb "Nhóm › Mục".
 * Điện thoại + máy tính bảng dọc (< lg): menu là ngăn kéo trái — đóng khi đổi trang, bấm nền hoặc Esc.
 * `header` (đổi ngôn ngữ, tài khoản, đăng xuất) do layout server truyền vào.
 */
export function AdminShell({
  groups,
  labels,
  header,
  children,
}: {
  groups: ShellGroup[];
  labels: { subtitle: string; menu: string; close: string; breadcrumb: string };
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // Ngăn kéo chỉ mở cho đúng trang đã bấm ☰ → tự đóng khi chuyển trang (không cần effect).
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;
  const close = () => setOpenedAt(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenedAt(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const current = activeHref(
    pathname,
    groups.flatMap((g) => g.items.map((i) => i.href)),
  );
  const group = groups.find((g) => g.items.some((i) => i.href === current));
  const item = group?.items.find((i) => i.href === current);

  return (
    <div className="min-h-dvh lg:flex">
      {open && (
        <button
          type="button"
          aria-label={labels.close}
          tabIndex={-1}
          onClick={close}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      )}
      <aside
        id="admin-nav"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r bg-background shadow-xl transition-[translate,visibility] duration-200",
          "lg:sticky lg:top-0 lg:visible lg:h-dvh lg:w-60 lg:flex-none lg:translate-x-0 lg:bg-muted/40 lg:shadow-none",
          open ? "visible translate-x-0" : "invisible -translate-x-full",
        )}
      >
        <div className="flex h-14 flex-none items-center gap-2 border-b px-4">
          <div className="grid h-7 min-w-7 flex-none place-items-center rounded-md bg-primary px-1 text-[10px] font-bold text-primary-foreground">{BRAND_MARK}</div>
          <div className="leading-tight">
            <div className="font-semibold">{BRAND_NAME}</div>
            <div className="text-[11px] text-muted-foreground">{labels.subtitle}</div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label={labels.close}
            className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-muted lg:hidden"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <nav aria-label="Admin" className="flex-1 space-y-4 overflow-y-auto p-3 text-sm">
          {groups.map((g, gi) => (
            <div key={g.label ?? gi}>
              {g.label && (
                <div className="mb-1 px-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{g.label}</div>
              )}
              <ul className="space-y-0.5">
                {g.items.map((i) => {
                  const Icon = ICONS[i.icon];
                  const active = i.href === current;
                  return (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "relative flex items-center gap-3 rounded-md px-2 py-2.5 lg:gap-2 lg:py-1.5",
                          active
                            ? "bg-primary/10 font-medium text-primary lg:bg-background lg:shadow-sm lg:ring-1 lg:ring-border"
                            : "hover:bg-muted",
                        )}
                      >
                        {active && <span className="absolute inset-y-1 -left-3 hidden w-[3px] rounded-r bg-primary lg:block" />}
                        <Icon className="size-4 flex-none" aria-hidden />
                        {i.label}
                        {i.badgeContent}
                        {i.badge && (
                          <span
                            className={cn("ml-auto rounded-full px-1.5 text-[11px] font-medium tabular-nums", TONES[i.badge.tone])}
                          >
                            {i.badge.n}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 flex-none items-center gap-2 border-b bg-background px-3 text-sm md:px-6">
          <button
            type="button"
            onClick={() => setOpenedAt(pathname)}
            aria-label={labels.menu}
            aria-expanded={open}
            aria-controls="admin-nav"
            className="-ml-1 rounded-md p-1.5 hover:bg-muted lg:hidden"
          >
            <Menu className="size-5" aria-hidden />
          </button>
          {item && (
            <nav aria-label={labels.breadcrumb} className="flex min-w-0 items-center gap-1 text-muted-foreground">
              {group?.label && (
                <>
                  <span className="hidden md:inline">{group.label}</span>
                  <ChevronRight className="hidden size-3 md:block" aria-hidden />
                </>
              )}
              <span className="truncate font-medium text-foreground">{item.label}</span>
            </nav>
          )}
          <div className="ml-auto flex flex-none items-center gap-1 sm:gap-2">{header}</div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
