import { Suspense } from "react";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/auth/roles";
import { computeAlerts } from "@/server/alerts/queries";
import { defaultRange, salesReport, workQueue } from "@/server/reports/queries";
import { outstandingCodSummary } from "@/server/orders/cod";
import { stockExceptions } from "@/server/inventory/overview";
import { catalogStats } from "@/server/catalog/stats";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Box, FileText, ImageOff, Package, ShieldCheck, Store, Tag, TriangleAlert } from "lucide-react";
import { Badge, BlockSkeleton, DataTable, LinkButton, Notice, Page, PageHeader, Segmented, Stat, Td } from "@/components/admin/ui";
import { LineChart } from "@/components/admin/charts";
import { cn } from "@/lib/utils";
import { PRODUCT_LABEL_TONE } from "@/components/admin/status-tones";
import { fmtDateTime, fmtInt } from "@/lib/format";
import { FEATURES } from "@/lib/features";
import { catalogTasks, DASHBOARD_RANGES, productActivity, recentProducts, recentReceipts } from "@/server/reports/catalog-dashboard";

/**
 * Tổng quan: trả lời "hiện tại cần chú ý điều gì?" theo thứ tự
 * kết quả kinh doanh → việc cần xử lý → ngoại lệ → hoạt động gần đây. Báo cáo chi tiết nằm ở mục Báo cáo.
 * Mỗi ô số ghi rõ kỳ/phạm vi và mở đúng trang/bộ lọc đã dùng để tính; số tài chính chỉ hiện cho người có quyền.
 */
export default async function DashboardPage({ searchParams }: PageProps<"/admin">) {
  const user = await requirePagePermission("dashboard:view");
  const { denied, range } = await searchParams;
  const days = DASHBOARD_RANGES.find((d) => String(d) === range) ?? DASHBOARD_RANGES[0];
  const showCatalog = can(user.role, "catalog:manage");
  const showOrders = can(user.role, "orders:view");
  const showStock = can(user.role, "stock:view");
  const showSales = can(user.role, "reports:view");
  const showCod = can(user.role, "orders:reconcile-cod");
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
      />
      {(showSales || showCod) && <Suspense fallback={<BlockSkeleton label={t("results")} />}><BusinessResults showSales={showSales} showCod={showCod} /></Suspense>}
      {(showOrders || showCatalog) && <Suspense fallback={<BlockSkeleton label={t("todo")} />}><WorkQueue showOrders={showOrders} showCatalog={showCatalog} /></Suspense>}
      {(showStock || showCatalog) && <Suspense fallback={<BlockSkeleton label={t("exceptions")} />}><Exceptions showStock={showStock} showCatalog={showCatalog} /></Suspense>}
      {showCatalog && <Suspense fallback={<BlockSkeleton label={t("recent")} />}><RecentActivity days={days} showStock={showStock} /></Suspense>}
      {showCatalog && <Suspense fallback={null}><PublishingFlowWhenEmpty /></Suspense>}
    </Page>
  );
}

const tone = (n: number, level: "warning" | "danger" = "warning") => n > 0 ? level : "neutral";

/** Kết quả kinh doanh: doanh thu / đơn hoàn tất / lợi nhuận gộp theo kỳ 30 ngày; COD chưa về là số dư hiện tại (không theo kỳ). */
async function BusinessResults({ showSales, showCod }: { showSales: boolean; showCod: boolean }) {
  await connection();
  const range = defaultRange();
  const [t, tr, report, cod] = await Promise.all([
    getTranslations("Dashboard"), getTranslations("Reports"),
    showSales ? salesReport(range) : null,
    showCod ? outstandingCodSummary() : null,
  ]);
  const reportHref = `/admin/reports?from=${range.from}&to=${range.to}`;
  const period = t("period", { from: range.from, to: range.to });
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-medium">{t("results")}</h2>
          {report && <p className="text-xs text-muted-foreground" data-testid="results-period">{period}</p>}
        </div>
        {report && <LinkButton href={reportHref}>{t("viewReports")}</LinkButton>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {report && (
          <>
            <Stat label={`${tr("revenue")} (MMK)`} value={fmtInt(report.totals.revenue)} href={reportHref} testId="month-revenue" />
            <Stat label={tr("orders")} value={fmtInt(report.totals.orders)} href={reportHref} />
            <Stat label={`${tr("profit")} (MMK)`} value={fmtInt(report.totals.profit)} href={reportHref} hint={report.totals.marginPct == null ? undefined : `${tr("margin")} ${report.totals.marginPct}%`} />
          </>
        )}
        {cod && (
          <Stat
            label={`${t("codOutstanding")} (MMK)`}
            value={fmtInt(cod.regular.mmk)}
            href="/admin/orders/cod?filter=waiting"
            tone={tone(cod.regular.count)}
            hint={t("codHint", { count: cod.regular.count, exception: cod.exception.count })}
            testId="cod-outstanding"
          />
        )}
      </div>
      {report && report.missingCostOrders.length > 0 && <Notice tone="warning">{t("profitMissingCost", { n: report.missingCostOrders.length })}</Notice>}
      {report && report.estimatedCostOrders.length > 0 && <p className="text-xs text-muted-foreground">{t("profitEstimated", { n: report.estimatedCostOrders.length })}</p>}
    </section>
  );
}

/** Việc cần xử lý: hàng đợi đơn + sản phẩm chờ duyệt / chờ hoàn thiện. Header và điều hướng không phải chờ truy vấn tổng hợp. */
async function WorkQueue({ showOrders, showCatalog }: { showOrders: boolean; showCatalog: boolean }) {
  await connection();
  const [t, queue, stats] = await Promise.all([
    getTranslations("Dashboard"),
    showOrders ? workQueue() : null,
    showCatalog ? catalogStats() : null,
  ]);
  return (
    <section className="space-y-2">
      <h2 className="font-medium">{t("todo")}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {queue && (
          <>
            <Stat label={t("codToConfirm")} value={queue.codToConfirm} href="/admin/orders?status=PENDING&paymentMethod=COD" tone={tone(queue.codToConfirm)} testId="todo-cod" />
            <Stat label={t("bankToConfirm")} value={queue.bankToConfirm} href="/admin/orders?status=PENDING&paymentMethod=BANK_TRANSFER" tone={tone(queue.bankToConfirm)} testId="todo-bank" />
            <Stat label={t("awaitingStock")} value={queue.awaitingStock} href="/admin/orders/preorders" tone={tone(queue.awaitingStock)} testId="todo-preorder" />
            <Stat label={t("preparing")} value={queue.preparing} href="/admin/orders?status=PREPARING" tone={tone(queue.preparing)} testId="todo-preparing" />
            <Stat label={t("shipping")} value={queue.shipping} href="/admin/orders?status=SHIPPING" />
            <Stat label={t("longShipping", { days: 7 })} value={queue.longShipping} href="/admin/orders?shippingDays=7" tone={tone(queue.longShipping, "danger")} />
            <Stat label={t("overdue")} value={queue.overdue} href="/admin/orders?overdue=1" tone={tone(queue.overdue, "danger")} />
          </>
        )}
        {stats && (
          <>
            <Stat label={t("toApprove")} value={fmtInt(stats.awaitingReview)} href="/admin/products?status=review" tone={tone(stats.awaitingReview)} hint={t("kpiRejected", { n: stats.rejected })} testId="todo-approve" />
            <Stat label={t("task.incomplete")} value={fmtInt(stats.draftIncomplete)} href="/admin/products?status=incomplete" tone={tone(stats.draftIncomplete)} testId="todo-incomplete" />
          </>
        )}
      </div>
    </section>
  );
}

/** Ngoại lệ cần chú ý: cảnh báo kho (tồn thấp, hạn dùng, chưa biết hạn, chờ kiểm tra, thiếu giá vốn) + SP thiếu dữ liệu. */
async function Exceptions({ showStock, showCatalog }: { showStock: boolean; showCatalog: boolean }) {
  await connection();
  const [t, alerts, stockEx, tasks, stats] = await Promise.all([
    getTranslations("Dashboard"),
    showStock ? computeAlerts() : null,
    showStock ? stockExceptions() : null,
    showCatalog ? catalogTasks() : null,
    showCatalog ? catalogStats() : null,
  ]);
  const taskRows = tasks && stats ? [
    { key: "noImage", icon: <ImageOff />, n: tasks.noImage, href: "/admin/products" },
    { key: "noPrice", icon: <Tag />, n: tasks.noPrice, href: "/admin/selling-prices" },
    { key: "notReceived", icon: <Box />, n: tasks.notReceived, href: "/admin/inventory?received=no" },
    { key: "outOfStock", icon: <TriangleAlert />, n: stats.published.outOfStock - stats.published.preorder, href: "/admin/products?status=outOfStock" },
    { key: "rejected", icon: <FileText />, n: stats.rejected, href: "/admin/products?status=rejected" },
  ].filter((r) => r.n > 0) : [];
  return (
    <section className="space-y-2">
      <h2 className="font-medium">{t("exceptions")}</h2>
      {alerts && stockEx && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label={t("lowStock")} value={alerts.counts.lowStock} href="/admin/alerts?tab=low" tone={tone(alerts.counts.lowStock)} testId="alert-low" />
          {FEATURES.expiry && (
            <Stat
              label={t("expiry")}
              value={`${alerts.counts.expired} / ${alerts.counts.blocked} / ${alerts.counts.near}`}
              href="/admin/alerts?tab=expiry"
              tone={tone(alerts.counts.expired + alerts.counts.blocked, "danger")}
            />
          )}
          <Stat label={t("reorder")} value={alerts.counts.reorder} href="/admin/alerts?tab=reorder" tone={tone(alerts.counts.reorder)} />
          {FEATURES.expiry && alerts.counts.unknown > 0 && <Stat label={t("unknownExpiry")} value={alerts.counts.unknown} href="/admin/inventory?view=lots&expiry=unknown" tone="warning" />}
          {stockEx.quarantineUnits > 0 && <Stat label={t("quarantine")} value={fmtInt(stockEx.quarantineUnits)} href="/admin/inventory/quarantine" tone="warning" hint={t("units")} testId="exc-quarantine" />}
          {stockEx.missingCostUnits > 0 && <Stat label={t("missingCost")} value={fmtInt(stockEx.missingCostUnits)} href="/admin/inventory?cost=missing" tone="warning" hint={t("units")} testId="exc-missing-cost" />}
        </div>
      )}
      {taskRows.length > 0 && (
        <Card title={t("catalogExceptions", { n: taskRows.reduce((s, r) => s + r.n, 0) })} testId="catalog-tasks">
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
        </Card>
      )}
    </section>
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

/** Hoạt động gần đây: phiếu nhập, sản phẩm cập nhật; biểu đồ hoạt động sản phẩm ở cuối (chỉ biểu đồ này theo khoảng 7/30 ngày). */
async function RecentActivity({ days, showStock }: { days: number; showStock: boolean }) {
  await connection();
  const [t, tp, activity, receipts, recent] = await Promise.all([
    getTranslations("Dashboard"),
    getTranslations("Products"),
    productActivity(days),
    showStock ? recentReceipts() : Promise.resolve([]),
    recentProducts(),
  ]);
  return (
    <div className="space-y-3">
      <h2 className="font-medium">{t("recent")}</h2>
      <div className={cn("grid gap-5", showStock && "lg:grid-cols-2")}>
        {showStock && (
          <Card title={t("receiptsTitle")} action={<Link href="/admin/inventory/documents" className="inline-flex items-center gap-1 text-sm text-primary">{t("viewAll")} <ArrowRight className="size-3.5" aria-hidden /></Link>} testId="recent-receipts">
            {receipts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("receiptsEmpty")}</p>
            ) : (
              <DataTable
                dense
                className="rounded-none border-0 bg-transparent"
                numeric={[3, 4]}
                head={[t("receiptCode"), t("receiptDate"), t("receiptLocation"), t("receiptSkus"), t("receiptQty"), t("receiptStatus")]}
              >
                {receipts.map((r) => (
                  <tr key={r.id}>
                    <Td><Link href={`/admin/inventory/documents/${r.id}`} className="font-mono text-xs hover:text-primary">{r.code}</Link></Td>
                    <Td className="whitespace-nowrap text-muted-foreground tabular-nums">{fmtDateTime(r.at)}</Td>
                    <Td>{r.location}</Td>
                    <Td numeric>{fmtInt(r.skus)}</Td>
                    <Td numeric>{fmtInt(r.qty)}</Td>
                    <Td><Badge tone={r.status === "POSTED" ? "success" : "warning"}>{t(r.status === "POSTED" ? "receiptPosted" : "receiptDraft")}</Badge></Td>
                  </tr>
                ))}
              </DataTable>
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
                <Badge tone={PRODUCT_LABEL_TONE[p.label]}>{tp(`lifecycle.${p.label}`)}</Badge>
                <span className="hidden text-xs text-muted-foreground tabular-nums sm:block">{fmtDateTime(p.updatedAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card
        title={t("activityTitle", { days })}
        action={
          <Segmented
            label={t("rangeLabel")}
            items={DASHBOARD_RANGES.map((d) => ({ href: d === DASHBOARD_RANGES[0] ? "/admin" : `/admin?range=${d}`, label: t("rangeDays", { n: d }), active: d === days }))}
          />
        }
        testId="catalog-activity"
      >
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
    </div>
  );
}

/** Dải "Quy trình đăng bán" chỉ hiện khi cửa hàng chưa có sản phẩm nào (người mới thiết lập). */
async function PublishingFlowWhenEmpty() {
  await connection();
  const stats = await catalogStats();
  if (stats.totalProducts > 0) return null;
  return <PublishingFlow />;
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
