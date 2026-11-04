import Link from "next/link";
import type { getTranslations } from "next-intl/server";
import { ChevronDown, Plus } from "lucide-react";
import { classifyExpiry, daysLeft } from "@/server/alerts/compute";
import { can, type Permission, type Role } from "@/server/auth/roles";
import type { StockFilter } from "@/server/inventory/overview";
import type { Thresholds } from "@/server/inventory/stock-summary";
import { Badge } from "@/components/admin/ui";
import { buttonVariants } from "@/components/ui/button";
import { fmtDay } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Khối dùng chung cho trang Tồn kho + lịch sử lô (P9c). Server components. */

type T = Awaited<ReturnType<typeof getTranslations>>;
export type StockView = "products" | "lots";

const NEW_DOCS: [type: string, permission: Permission][] = [
  ["RECEIVE", "stock:receive"],
  ["TRANSFER", "stock:transfer"],
  ["ISSUE", "stock:issue"],
  ["ADJUST", "stock:adjust"],
];

/** Nút "Tạo phiếu" mở danh sách loại phiếu theo quyền (trang Tồn kho + danh sách phiếu). `td` = namespace Docs. */
export function NewDocMenu({ role, label, td }: { role: Role; label: string; td: T }) {
  const types = NEW_DOCS.filter(([, p]) => can(role, p));
  if (types.length === 0) return null;
  return (
    <details className="group relative">
      <summary className={cn(buttonVariants({ size: "lg" }), "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
        <Plus className="size-4" aria-hidden />
        {label}
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border bg-popover p-1 text-sm shadow-md">
        {types.map(([type]) => (
          <Link key={type} href={`/admin/inventory/documents/new?type=${type}`} className="block rounded-md px-3 py-2 hover:bg-muted">
            {td(type)}
          </Link>
        ))}
      </div>
    </details>
  );
}

/** URL trang Tồn kho giữ bộ lọc hiện tại; `patch` ghi đè (page về 1 nếu không chỉ định). */
export function stockHref(f: StockFilter, view: StockView, patch: Partial<StockFilter> & { view?: StockView } = {}) {
  const next = { ...f, page: 1, view, ...patch };
  const sp = new URLSearchParams();
  if (next.tab !== "all") sp.set("tab", next.tab);
  if (next.q) sp.set("q", next.q);
  if (next.expiry) sp.set("expiry", next.expiry);
  if (next.stockType) sp.set("stockType", next.stockType);
  if (next.view !== "products") sp.set("view", next.view);
  if (next.page > 1) sp.set("page", String(next.page));
  const qs = sp.toString();
  return qs ? `/admin/inventory?${qs}` : "/admin/inventory";
}

/** Hạn dùng + nhãn cận hạn / ngừng bán / hết hạn (kèm số ngày còn lại). */
export function ExpiryTag({ date, status, now, t, th }: { date: Date | null; status?: "DATED" | "NONE" | "UNKNOWN"; now: Date; t: T; th: Thresholds }) {
  if (!date) return <Badge tone={status === "NONE" ? "neutral" : "warning"}>{t(status === "NONE" ? "expiryNone" : "expiryUnknown")}</Badge>;
  const level = classifyExpiry(date, now, th);
  const left = daysLeft(date, now);
  return (
    <span className="inline-flex flex-wrap items-center gap-1 whitespace-nowrap">
      <span className="tabular-nums">{fmtDay(date)}</span>
      {level === "near" && <Badge tone="warning">{t("daysLeft", { n: left })}</Badge>}
      {level === "blocked" && <Badge tone="danger">{`${t("blocked")} · ${t("daysLeft", { n: left })}`}</Badge>}
      {level === "expired" && <Badge tone="danger">{t("expired")}</Badge>}
    </span>
  );
}

export function Pager({
  page,
  pageCount,
  total,
  pageSize,
  href,
  t,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  href: (page: number) => string;
  t: T;
}) {
  if (total === 0) return null;
  const from = Math.min(total, (page - 1) * pageSize + 1);
  const to = Math.min(total, page * pageSize);
  const btn = "inline-flex h-8 items-center rounded-md border bg-background px-2.5";
  return (
    <nav aria-label={t("pagination")} className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span data-testid="page-info">{t("pageInfo", { from, to, total })}</span>
      <div className="flex gap-1">
        {page > 1 ? (
          <Link href={href(page - 1)} className={cn(btn, "hover:bg-muted")}>
            {t("prev")}
          </Link>
        ) : (
          <span className={cn(btn, "opacity-50")}>{t("prev")}</span>
        )}
        <span className={cn(btn, "border-primary text-primary")} aria-current="page">
          {page} / {pageCount}
        </span>
        {page < pageCount ? (
          <Link href={href(page + 1)} className={cn(btn, "hover:bg-muted")}>
            {t("next")}
          </Link>
        ) : (
          <span className={cn(btn, "opacity-50")}>{t("next")}</span>
        )}
      </div>
    </nav>
  );
}
