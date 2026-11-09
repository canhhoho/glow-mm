"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, House, ListOrdered, PlusCircle, UserRound, Users, type LucideIcon } from "lucide-react";
import { activeHref } from "@/server/admin/nav";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  "/ctv": House,
  "/ctv/orders": ListOrdered,
  "/ctv/orders/new": PlusCircle,
  "/ctv/team": Users,
  "/ctv/payouts": CreditCard,
  "/ctv/account": UserRound,
};

/**
 * Thanh mục của cổng CTV, sáng mục đang mở.
 * `tabs`: tab ngang trên header (desktop). `bottom`: thanh cố định ở đáy màn hình (chỉ mobile), mục Tạo đơn nổi bật.
 */
export function CtvNav({ items, variant = "tabs" }: { items: { href: string; label: string }[]; variant?: "tabs" | "bottom" }) {
  const pathname = usePathname();
  const current = activeHref(pathname, items.map((i) => i.href), "/ctv");

  if (variant === "bottom") {
    return (
      <nav
        aria-label="CTV"
        data-testid="ctv-bottom-nav"
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="mx-auto grid max-w-md auto-cols-fr grid-flow-col">
          {items.map((i) => {
            const Icon = ICONS[i.href];
            const active = i.href === current;
            const primary = i.href === "/ctv/orders/new";
            return (
              <li key={i.href}>
                <Link
                  href={i.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 px-0.5 py-1.5 text-center text-[11px] leading-tight text-muted-foreground",
                    active && "font-medium text-brand",
                  )}
                >
                  {Icon && (
                    <span
                      className={cn(
                        "grid place-items-center",
                        primary ? "size-8 rounded-full bg-brand text-brand-foreground shadow-sm" : "size-6",
                      )}
                    >
                      <Icon className="size-5" aria-hidden />
                    </span>
                  )}
                  <span className="line-clamp-2 w-full break-words">{i.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  return (
    <nav aria-label="CTV" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-1 text-sm whitespace-nowrap">
        {items.map((i) => {
          const Icon = ICONS[i.href];
          const active = i.href === current;
          return (
            <li key={i.href}>
              <Link
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 hover:bg-muted",
                  active && "bg-accent font-medium text-accent-foreground",
                )}
              >
                {Icon && <Icon className="size-4" aria-hidden />}
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
