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
import { catalogStats } from "@/server/catalog/stats";
import Link from "next/link";
import Image from "next/image";
import { ArrowDown, ArrowRight, ArrowUp, Box, ClipboardList, FileText, ImageOff, Package, ShieldCheck, ShoppingCart, Store, Tag, TriangleAlert } from "lucide-react";
import { Badge, StatCard } from "@/components/admin/ui";
import { Donut, LineChart } from "@/components/admin/charts";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/format";
import { catalogTasks, DASHBOARD_RANGES, dashboardKpis, productActivity, recentProducts, recentReceipts } from "@/server/reports/catalog-dashboard";

export default async function DashboardPage({ searchParams }: PageProps<"/admin">) {
  const user = await requirePagePermission("dashboard:view");
  const { denied, range } = await searchParams;
  const days = DASHBOARD_RANGES.find((d) => String(d) === range) ?? DASHBOARD_RANGES[0];
  const showCatalog = can(user.role, "catalog:manage");
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
      <PageHeader
        title={t("welcomeBack", { name: user.name })}
        description={<span data-testid="role">{t("role", { role: tr(user.role) })} · {t("overviewSubtitle")}</span>}
        actions={
          showCatalog ? (
            <nav aria-label={t("rangeLabel")} className="flex rounded-lg border p-0.5 text-sm">
              {DASHBOARD_RANGES.map((d) => (
                <Link key={d} href={d === DASHBOARD_RANGES[0] ? "/admin" : `/admin?range=${d}`} aria-current={d === days ? "true" : undefined} className={cn("rounded-md px-3 py-1.5", d === days ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:text-foreground")}>
                  {t("rangeDays", { n: d })}
                </Link>
              ))}
            </nav>
          ) : undefined
        }
      />
      {showCatalog && <Suspense fallback={<DashboardLoading label={t("catalog")} />}><CatalogOverview days={days} showOrders={showOrders} showStock={showStock} /></Suspense>}
      {showOrders && <Suspense fallback={<DashboardLoading label={t("todo")} />}><OrderQueue canReconcile={can(user.role, "orders:reconcile-cod")} /></Suspense>}
      {showStock && <Suspense fallback={<DashboardLoading label={t("alerts")} />}><StockAlerts /></Suspense>}
      {showSales && <Suspense fallback={<DashboardLoading label={t("sales")} />}><SalesOverview /></Suspense>}
      {showCatalog && <PublishingFlow />}
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
            <Stat label={t("awaitingStock")} value={queue.awaitingStock} href="/admin/orders/preorders" tone={tone(queue.awaitingStock)} testId="todo-preorder" />
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

const LABEL_TONE = { PUBLISHED: "success", HIDDEN: "neutral", PENDING: "warning", REJECTED: "danger", DRAFT: "neutral", ARCHIVED: "neutral" } as const;

function Trend({ n, text }: { n: number; text: string }) {
  const Icon = n > 0 ? ArrowUp : n < 0 ? ArrowDown : null;
  return (
    <span className={cn("mt-1 inline-flex items-center gap-1 text-xs", n > 0 ? "text-success" : n < 0 ? "text-destructive" : "text-muted-foreground")}>
      {Icon && <Icon className="size-3" aria-hidden />}
      {text}
    </span>
  );
}

function Card({ title, action, children, className, testId }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string; testId?: string }) {
  return (
    <section className={cn("space-y-3 rounded-xl border bg-card p-4", className)} data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-medium">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** P3 — khối SP của dashboard (thiết kế "Dashboard"): ô số + xu hướng, biểu đồ, cơ cấu, việc cần làm, gần đây. */
async function CatalogOverview({ days, showOrders, showStock }: { days: number; showOrders: boolean; showStock: boolean }) {
  await connection();
  const [t, tp, stats, kpi, activity, tasks, receipts, recent] = await Promise.all([
    getTranslations("Dashboard"),
    getTranslations("Products"),
    catalogStats(),
    dashboardKpis(days),
    productActivity(days),
    catalogTasks(),
    showStock ? recentReceipts() : Promise.resolve([]),
    recentProducts(),
  ]);
  const taskRows = [
    { key: "review", icon: <ShieldCheck />, n: stats.awaitingReview, href: "/admin/products?status=review" },
    { key: "incomplete", icon: <ClipboardList />, n: stats.draftIncomplete, href: "/admin/products?status=incomplete" },
    { key: "noImage", icon: <ImageOff />, n: tasks.noImage, href: "/admin/products" },
    { key: "noPrice", icon: <Tag />, n: tasks.noPrice, href: "/admin/selling-prices" },
    { key: "notReceived", icon: <Box />, n: tasks.notReceived, href: "/admin/inventory" },
    { key: "outOfStock", icon: <TriangleAlert />, n: stats.published.outOfStock - stats.published.preorder, href: "/admin/products?status=outOfStock" },
    { key: "rejected", icon: <FileText />, n: stats.rejected, href: "/admin/products?status=rejected" },
  ].filter((r) => r.n > 0);
  const draftAll = stats.byLabel.DRAFT + stats.byLabel.REJECTED;
  return (
    <div className="space-y-5">
      <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-3", showOrders ? "xl:grid-cols-5" : "xl:grid-cols-4")}>
        <div>
          <StatCard icon={<Package />} tone="brand" value={fmtInt(stats.totalProducts)} label={t("kpiProducts")} href="/admin/products" testId="kpi-products" />
          <Trend n={kpi.newProducts} text={t("trendNew", { n: kpi.newProducts, days })} />
        </div>
        <div>
          <StatCard icon={<Box />} tone="green" value={fmtInt(kpi.inStockSkus)} label={t("kpiInStock")} href="/admin/inventory" />
          <span className="mt-1 block text-xs text-muted-foreground">{t("kpiInStockHint", { n: fmtInt(stats.skus) })}</span>
        </div>
        <div>
          <StatCard icon={<ShieldCheck />} tone="warning" value={fmtInt(stats.awaitingReview)} label={t("toApprove")} href="/admin/products?status=review" testId="todo-approve" />
          <span className="mt-1 block text-xs text-muted-foreground">{t("kpiRejected", { n: stats.rejected })}</span>
        </div>
        <div>
          <StatCard icon={<Store />} tone="success" value={fmtInt(stats.published.total)} label={t("catalogPublished")} href="/admin/products?status=published" testId="catalog-published" />
          <Trend n={kpi.newlyPublished} text={t("trendPublished", { n: kpi.newlyPublished, days })} />
        </div>
        {showOrders && (
          <div>
            <StatCard icon={<ShoppingCart />} tone="neutral" value={fmtInt(kpi.orders)} label={t("kpiOrders", { days })} href="/admin/orders" />
            <Trend n={kpi.ordersDelta} text={t("trendOrders", { n: (kpi.ordersDelta > 0 ? "+" : "") + kpi.ordersDelta })} />
          </div>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-12">
        <Card title={t("activityTitle", { days })} className="xl:col-span-5" testId="catalog-activity">
          <LineChart
            ariaLabel={t("activityTitle", { days })}
            labels={activity.map((a) => a.day.slice(8, 10) + "/" + a.day.slice(5, 7))}
            series={[
              { key: "created", label: t("series.created"), color: "var(--primary)", values: activity.map((a) => a.created) },
              { key: "published", label: t("series.published"), color: "var(--success)", values: activity.map((a) => a.published) },
              { key: "submitted", label: t("series.submitted"), color: "var(--warning)", values: activity.map((a) => a.submitted) },
            ]}
          />
        </Card>
        <Card title={t("mixTitle")} className="xl:col-span-3" testId="catalog-mix">
          <Donut
            ariaLabel={t("mixTitle")}
            total={stats.totalProducts}
            centerLabel={t("mixCenter")}
            slices={[
              { key: "published", label: t("mix.published"), value: stats.byLabel.PUBLISHED, color: "var(--success)", href: "/admin/products?status=published" },
              { key: "review", label: t("mix.review"), value: stats.byLabel.PENDING, color: "var(--warning)", href: "/admin/products?status=review" },
              { key: "draft", label: t("mix.draft"), value: draftAll, color: "var(--primary)", href: "/admin/products?status=draft" },
              { key: "hidden", label: t("mix.hidden"), value: stats.byLabel.HIDDEN, color: "var(--muted-foreground)", href: "/admin/products?status=hidden" },
            ]}
          />
        </Card>
        <Card title={t("tasksTitle", { n: taskRows.reduce((s, r) => s + r.n, 0) })} className="xl:col-span-4" testId="catalog-tasks">
          {taskRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("tasksEmpty")}</p>
          ) : (
            <ul className="divide-y text-sm">
              {taskRows.map((r) => (
                <li key={r.key}>
                  <Link href={r.href} className="flex items-center gap-3 py-2 hover:text-primary">
                    <span className="text-muted-foreground [&_svg]:size-4" aria-hidden>{r.icon}</span>
                    <span className="flex-1">{t(`task.${r.key}`)}</span>
                    <Badge tone="warning">{fmtInt(r.n)}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className={cn("grid gap-5", showStock && "lg:grid-cols-2")}>
        {showStock && (
          <Card title={t("receiptsTitle")} action={<Link href="/admin/inventory/documents" className="inline-flex items-center gap-1 text-sm text-primary">{t("viewAll")} <ArrowRight className="size-3.5" aria-hidden /></Link>} testId="recent-receipts">
            {receipts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("receiptsEmpty")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1.5 font-medium">{t("receiptCode")}</th>
                      <th className="py-1.5 font-medium">{t("receiptDate")}</th>
                      <th className="py-1.5 font-medium">{t("receiptLocation")}</th>
                      <th className="py-1.5 text-right font-medium">{t("receiptSkus")}</th>
                      <th className="py-1.5 text-right font-medium">{t("receiptQty")}</th>
                      <th className="py-1.5 pl-3 font-medium">{t("receiptStatus")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {receipts.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2"><Link href={`/admin/inventory/documents/${r.id}`} className="font-mono text-xs hover:text-primary">{r.code}</Link></td>
                        <td className="py-2 text-xs whitespace-nowrap text-muted-foreground tabular-nums">{fmtDateTime(r.at)}</td>
                        <td className="py-2">{r.location}</td>
                        <td className="py-2 text-right tabular-nums">{fmtInt(r.skus)}</td>
                        <td className="py-2 text-right tabular-nums">{fmtInt(r.qty)}</td>
                        <td className="py-2 pl-3"><Badge tone={r.status === "POSTED" ? "success" : "warning"}>{t(r.status === "POSTED" ? "receiptPosted" : "receiptDraft")}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
        <Card title={t("recentTitle")} action={<Link href="/admin/products" className="inline-flex items-center gap-1 text-sm text-primary">{t("viewAll")} <ArrowRight className="size-3.5" aria-hidden /></Link>} testId="recent-products">
          <ul className="divide-y">
            {recent.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2">
                <span className="relative size-10 shrink-0 overflow-hidden rounded-lg border bg-muted">
                  {p.image && <Image src={p.image} alt={p.name} fill sizes="40px" className="object-cover" />}
                </span>
                <Link href={`/admin/products/${p.id}`} className="min-w-0 flex-1 hover:text-primary">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="block font-mono text-xs text-muted-foreground">{p.sku}</span>
                </Link>
                <Badge tone={LABEL_TONE[p.label]}>{tp(`lifecycle.${p.label}`)}</Badge>
                <span className="hidden text-xs text-muted-foreground tabular-nums sm:block">{fmtDateTime(p.updatedAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

/** Dải "Quy trình đăng bán": 2A nhập kho và 2B thiết lập giá làm song song, không bắt theo thứ tự. */
async function PublishingFlow() {
  const t = await getTranslations("Dashboard");
  const steps = [
    { key: "create", n: "1", icon: <Package />, tone: "bg-primary/10 text-primary", href: "/admin/products/new" },
    { key: "stock", n: "2A", icon: <Box />, tone: "bg-secondary text-brand-2", href: "/admin/inventory/documents" },
    { key: "price", n: "2B", icon: <Tag />, tone: "bg-muted text-foreground", href: "/admin/selling-prices" },
    { key: "review", n: "3", icon: <ShieldCheck />, tone: "bg-warning-muted text-warning", href: "/admin/products?status=review" },
    { key: "publish", n: "4", icon: <Store />, tone: "bg-success-muted text-success", href: "/admin/products?status=published" },
  ];
  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-gradient-to-r from-primary/5 to-transparent p-4 lg:flex-row lg:items-center" data-testid="publishing-flow">
      <div className="lg:w-64 lg:shrink-0">
        <h2 className="text-lg font-semibold text-primary">{t("flowTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("flowHint")}</p>
      </div>
      <ol className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {steps.map((s) => (
          <li key={s.key}>
            <Link href={s.href} className={cn("flex h-full flex-col items-center gap-1 rounded-xl p-3 text-center transition-opacity hover:opacity-80 [&_svg]:size-5", s.tone)}>
              <span aria-hidden>{s.icon}</span>
              <span className="text-sm font-semibold">{s.n}. {t(`flow.${s.key}`)}</span>
              <span className="text-xs opacity-80">{t(`flow.${s.key}Hint`)}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
