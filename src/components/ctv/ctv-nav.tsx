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

/** Thanh mục của cổng CTV: tab ngang (cuộn được trên mobile), sáng mục đang mở. */
export function CtvNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const current = activeHref(pathname, items.map((i) => i.href), "/ctv");
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
