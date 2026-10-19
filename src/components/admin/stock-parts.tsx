import Link from "next/link";
import type { getTranslations } from "next-intl/server";
import { classifyExpiry, daysLeft } from "@/server/alerts/compute";
import type { StockFilter } from "@/server/inventory/overview";
import type { Thresholds } from "@/server/inventory/stock-summary";
import { Badge } from "@/components/admin/ui";
import { fmtDay } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Khối dùng chung cho trang Tồn kho + lịch sử lô (P9c). Server components. */

type T = Awaited<ReturnType<typeof getTranslations>>;
export type StockView = "products" | "lots";

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
export function ExpiryTag({ date, now, t, th }: { date: Date; now: Date; t: T; th: Thresholds }) {
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
