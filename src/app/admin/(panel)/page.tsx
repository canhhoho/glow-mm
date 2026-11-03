import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/auth/roles";
import { computeAlerts } from "@/server/alerts/queries";
import { defaultRange, salesReport, workQueue } from "@/server/reports/queries";
import { LinkButton, Notice, Page, PageHeader, Stat } from "@/components/admin/ui";
import { fmtInt } from "@/lib/format";
import { yangonDayKey } from "@/lib/time";

export default async function DashboardPage({ searchParams }: PageProps<"/admin">) {
  const user = await requirePagePermission("dashboard:view");
  const { denied } = await searchParams;
  const showOrders = can(user.role, "orders:view");
  const showStock = can(user.role, "stock:view");
  const showSales = can(user.role, "reports:view");
  const today = yangonDayKey(new Date());
  const [t, tr, trp, queue, alerts, month, todaySales] = await Promise.all([
    getTranslations("Dashboard"),
    getTranslations("Role"),
    getTranslations("Reports"),
    showOrders ? workQueue() : null,
    showStock ? computeAlerts() : null,
    showSales ? salesReport(defaultRange()) : null,
    showSales ? salesReport({ from: today, to: today }) : null,
  ]);
  const tone = (n: number, level: "warning" | "danger" = "warning") => (n > 0 ? level : "neutral");

  return (
    <Page>
      {denied && <Notice tone="danger">{t("denied")}</Notice>}
      <PageHeader title={t("welcome", { name: user.name })} description={<span data-testid="role">{t("role", { role: tr(user.role) })}</span>} />

      {queue && (
        <section className="space-y-2">
          <h2 className="font-medium">{t("todo")}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label={t("codToConfirm")} value={queue.codToConfirm} href="/admin/orders?status=PENDING&paymentMethod=COD" tone={tone(queue.codToConfirm)} testId="todo-cod" />
            <Stat label={t("bankToConfirm")} value={queue.bankToConfirm} href="/admin/orders?status=PENDING&paymentMethod=BANK_TRANSFER" tone={tone(queue.bankToConfirm)} testId="todo-bank" />
            <Stat label={t("preparing")} value={queue.preparing} href="/admin/orders?status=PREPARING" tone={tone(queue.preparing)} testId="todo-preparing" />
            <Stat label={t("shipping")} value={queue.shipping} href="/admin/orders?status=SHIPPING" />
            <Stat label={t("overdue")} value={queue.overdue} href="/admin/orders?overdue=1" tone={tone(queue.overdue, "danger")} />
          </div>
        </section>
      )}

      {alerts && (
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
          </div>
        </section>
      )}

      {month && todaySales && (
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
      )}
    </Page>
  );
}
