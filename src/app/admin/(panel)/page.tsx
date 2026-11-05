import { Suspense } from "react";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/auth/roles";
import { computeAlerts } from "@/server/alerts/queries";
import { defaultRange, salesReport, workQueue } from "@/server/reports/queries";
import { LinkButton, Notice, Page, PageHeader, Stat } from "@/components/admin/ui";
import { fmtInt } from "@/lib/format";
import { yangonDayKey } from "@/lib/time";
import { prisma } from "@/lib/db";

export default async function DashboardPage({ searchParams }: PageProps<"/admin">) {
  const user = await requirePagePermission("dashboard:view");
  const { denied } = await searchParams;
  const showOrders = can(user.role, "orders:view");
  const showStock = can(user.role, "stock:view");
  const showSales = can(user.role, "reports:view");
  const [t, tr] = await Promise.all([
    getTranslations("Dashboard"),
    getTranslations("Role"),
  ]);
  return (
    <Page>
      {denied && <Notice tone="danger">{t("denied")}</Notice>}
      <PageHeader title={t("welcome", { name: user.name })} description={<span data-testid="role">{t("role", { role: tr(user.role) })}</span>} />
      {showOrders && <Suspense fallback={<DashboardLoading label={t("todo")} />}><OrderQueue canReconcile={can(user.role, "orders:reconcile-cod")} /></Suspense>}
      {showStock && <Suspense fallback={<DashboardLoading label={t("alerts")} />}><StockAlerts /></Suspense>}
      {showSales && <Suspense fallback={<DashboardLoading label={t("sales")} />}><SalesOverview /></Suspense>}
    </Page>
  );
}

const tone = (n: number, level: "warning" | "danger" = "warning") => n > 0 ? level : "neutral";

function DashboardLoading({ label }: { label: string }) {
  return <section aria-label={label} aria-busy="true" className="space-y-2"><h2 className="font-medium">{label}</h2><div aria-hidden className="h-28 animate-pulse rounded-lg bg-muted" /></section>;
}

/** Header và điều hướng không phải chờ các truy vấn tổng hợp. Mỗi nhóm dữ liệu stream riêng. */
async function OrderQueue({ canReconcile }: { canReconcile: boolean }) {
  await connection();
  const [t, tc, queue, codPending] = await Promise.all([
    getTranslations("Dashboard"), getTranslations("Cod"), workQueue(),
    canReconcile ? prisma.order.count({ where: { paymentMethod: "COD", codCollectedAt: { not: null }, codRemittedAt: null } }) : null,
  ]);
  return (

        <section className="space-y-2">
          <h2 className="font-medium">{t("todo")}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label={t("codToConfirm")} value={queue.codToConfirm} href="/admin/orders?status=PENDING&paymentMethod=COD" tone={tone(queue.codToConfirm)} testId="todo-cod" />
            <Stat label={t("bankToConfirm")} value={queue.bankToConfirm} href="/admin/orders?status=PENDING&paymentMethod=BANK_TRANSFER" tone={tone(queue.bankToConfirm)} testId="todo-bank" />
            <Stat label={t("preparing")} value={queue.preparing} href="/admin/orders?status=PREPARING" tone={tone(queue.preparing)} testId="todo-preparing" />
            <Stat label={t("shipping")} value={queue.shipping} href="/admin/orders?status=SHIPPING" />
            <Stat label={t("longShipping", { days: 7 })} value={queue.longShipping} href="/admin/orders?shippingDays=7" tone={tone(queue.longShipping, "danger")} />
            <Stat label={t("overdue")} value={queue.overdue} href="/admin/orders?overdue=1" tone={tone(queue.overdue, "danger")} />
            {codPending != null && <Stat label={tc("waiting")} value={codPending} href="/admin/orders/cod" tone={tone(codPending)} />}
          </div>
        </section>
  );
}

async function StockAlerts() {
  await connection();
  const [t, alerts] = await Promise.all([getTranslations("Dashboard"), computeAlerts()]);
  return (
        <section className="space-y-2">
          <h2 className="font-medium">{t("alerts")}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label={t("lowStock")} value={alerts.counts.lowStock} href="/admin/alerts?tab=low" tone={tone(alerts.counts.lowStock)} testId="alert-low" />
            <Stat
              label={t("expiry")}
              value={`${alerts.counts.expired} / ${alerts.counts.blocked} / ${alerts.counts.near}`}
              href="/admin/alerts?tab=expiry"
              tone={tone(alerts.counts.expired + alerts.counts.blocked, "danger")}
            />
            <Stat label={t("reorder")} value={alerts.counts.reorder} href="/admin/alerts?tab=reorder" tone={tone(alerts.counts.reorder)} />
            {alerts.counts.unknown > 0 && <Stat label={t("unknownExpiry")} value={alerts.counts.unknown} href="/admin/inventory?view=lots&expiry=unknown" tone="warning" />}
          </div>
        </section>
  );
}

async function SalesOverview() {
  await connection();
  const today = yangonDayKey(new Date());
  const [t, trp, month, todaySales] = await Promise.all([
    getTranslations("Dashboard"), getTranslations("Reports"), salesReport(defaultRange()), salesReport({ from: today, to: today }),
  ]);
  return (
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-medium">{t("sales")}</h2>
            <LinkButton href="/admin/reports">{t("viewReports")}</LinkButton>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={`${t("today")} · ${trp("revenue")} (MMK)`} value={fmtInt(todaySales.totals.revenue)} />
            <Stat label={`${trp("revenue")} (MMK)`} value={fmtInt(month.totals.revenue)} testId="month-revenue" />
            <Stat label={trp("margin")} value={month.totals.marginPct == null ? "—" : `${month.totals.marginPct}%`} />
            <Stat label={trp("orders")} value={month.totals.orders} />
          </div>
        </section>
  );
}
