import Link from "next/link";
import type { getTranslations } from "next-intl/server";
import { ChevronDown, Plus } from "lucide-react";
import { classifyExpiry, daysLeft } from "@/server/alerts/compute";
import { can, type Permission, type Role } from "@/server/auth/roles";
import type { StockFilter } from "@/server/inventory/overview";
import type { Thresholds } from "@/server/inventory/stock-summary";
import { ActionMenu } from "@/components/admin/action-menu";
import { Badge, MENU_ITEM } from "@/components/admin/ui";
import { buttonVariants } from "@/components/ui/button";
import { fmtDay } from "@/lib/format";

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
    <ActionMenu
      triggerClassName={buttonVariants({ size: "lg" })}
      trigger={
        <>
          <Plus aria-hidden />
          {label}
          <ChevronDown className="transition-transform group-open:rotate-180" aria-hidden />
        </>
      }
    >
      {types.map(([type]) => (
        <Link key={type} href={`/admin/inventory/documents/new?type=${type}`} className={MENU_ITEM}><Plus aria-hidden className="size-4 shrink-0" /> {td(type)}</Link>
      ))}
    </ActionMenu>
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
  if (next.received) sp.set("received", next.received);
  if (next.status) sp.set("status", next.status);
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

