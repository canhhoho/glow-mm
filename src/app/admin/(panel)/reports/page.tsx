import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { defaultRange, salesReport, type Range } from "@/server/reports/queries";
import { DataTable, fieldClass, fieldLabelClass, FilterBar, FilterButton, Notice, Page, PageHeader, Section, Stat, Td } from "@/components/admin/ui";
import { ReportsTabs } from "@/components/admin/reports-tabs";
import { fmtInt } from "@/lib/format";
import { addDays } from "@/lib/time";
import { cn } from "@/lib/utils";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 366;

function parseRange(sp: Record<string, string | string[] | undefined>): Range {
  const def = defaultRange();
  let from = typeof sp.from === "string" && DAY.test(sp.from) ? sp.from : def.from;
  let to = typeof sp.to === "string" && DAY.test(sp.to) ? sp.to : def.to;
  if (from > to) [from, to] = [to, from]; // nhập ngược → đảo lại thay vì âm thầm về mặc định
  // Giới hạn độ dài kỳ để truy vấn nhẹ.
  return from < addDays(to, -(MAX_DAYS - 1)) ? { from: addDays(to, -(MAX_DAYS - 1)), to } : { from, to };
}

export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  await requirePagePermission("reports:view");
  const range = parseRange(await searchParams);
  const [t, tc, report] = await Promise.all([
    getTranslations("Reports"),
    getTranslations("Common"),
    salesReport(range),
  ]);
  const { totals } = report;
  const maxRevenue = Math.max(1, ...report.daily.map((d) => d.revenue));

  return (
    <Page>
      <PageHeader title={(await getTranslations("Nav"))("salesReports")} description={t("basis")} />
      <ReportsTabs active="sales" />
      {/* key theo kỳ: điều hướng phía client giữ DOM → defaultValue cũ; đổi key để ô ngày hiện kỳ đã chuẩn hoá. */}
      <FilterBar key={`${range.from}|${range.to}`}>
        <label className={fieldLabelClass}>
          <span className="text-muted-foreground">{t("from")}</span>
          <input type="date" name="from" defaultValue={range.from} className={cn(fieldClass, "w-40")} />
        </label>
        <label className={fieldLabelClass}>
          <span className="text-muted-foreground">{t("to")}</span>
          <input type="date" name="to" defaultValue={range.to} className={cn(fieldClass, "w-40")} />
        </label>
        <FilterButton>{tc("filter")}</FilterButton>
      </FilterBar>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={`${t("revenue")} (MMK)`} value={fmtInt(totals.revenue)} testId="r-revenue" />
        <Stat label={`${t("cogs")} (MMK)`} value={fmtInt(totals.cogs)} testId="r-cogs" />
        <Stat label={`${t("profit")} (MMK)`} value={fmtInt(totals.profit)} testId="r-profit" />
        <Stat label={t("margin")} value={totals.marginPct == null ? "—" : `${totals.marginPct}%`} />
        <Stat label={t("orders")} value={totals.orders} testId="r-orders" />
        <Stat label={`${t("returns")} (MMK)`} value={fmtInt(totals.returnedRevenue)} />
        <Stat label={`${t("shippingFees")} (MMK)`} value={fmtInt(totals.shippingFees)} />
        <Stat label={`${t("commission")} (MMK)`} value={fmtInt(totals.commission)} testId="r-commission" />
        <Stat label={`${t("uplineCommission")} (MMK)`} value={fmtInt(totals.uplineCommission)} />
        <Stat label={`${t("profitAfterCommission")} (MMK)`} value={fmtInt(totals.profitAfterCommission)} />
        <Stat label={`${t("codCarrierFees")} (MMK)`} value={fmtInt(totals.codCarrierFees)} testId="r-cod-fees" />
        <Stat label={`${t("profitAfterRecordedCosts")} (MMK)`} value={fmtInt(totals.profitAfterRecordedCosts)} testId="r-recorded-profit" />
      </section>
      <p className="text-sm text-muted-foreground">{t("recordedCostBasis", { pending: totals.unsettledCodOrders, sender: totals.senderPaysOrders })}</p>

      {report.missingCostOrders.length > 0 && (
        <Notice tone="warning">
          {t("missingCost")} <span className="font-mono">{report.missingCostOrders.slice(0, 10).join(", ")}</span>
          {report.missingCostOrders.length > 10 && ` ${t("andMore", { count: report.missingCostOrders.length - 10 })}`}
        </Notice>
      )}

      {report.estimatedCostOrders.length > 0 && (
        <Notice>
          {t("estimatedCost")} <span className="font-mono">{report.estimatedCostOrders.slice(0, 10).join(", ")}</span>
          {report.estimatedCostOrders.length > 10 && ` ${t("andMore", { count: report.estimatedCostOrders.length - 10 })}`}
        </Notice>
      )}

      <Section title={t("daily")}>
        <DataTable empty={t("empty")} numeric={[1, 2, 4, 5]} head={[t("day"), t("orders"), t("revenue"), <span key="bar" className="sr-only">{t("revenue")}</span>, t("cogs"), t("profit")]}>
          {report.daily
            .filter((d) => d.orders > 0)
            .map((d) => (
              <tr key={d.day}>
                <Td className="whitespace-nowrap">{d.day}</Td>
                <Td numeric>{d.orders}</Td>
                <Td numeric>{fmtInt(d.revenue)}</Td>
                <Td className="w-1/3">
                  <div className="h-2 rounded bg-primary/70" style={{ width: `${(Math.max(0, d.revenue) / maxRevenue) * 100}%` }} />
                </Td>
                <Td numeric>{fmtInt(d.cogs)}</Td>
                <Td numeric>{fmtInt(d.profit)}</Td>
              </tr>
            ))}
        </DataTable>
      </Section>

      <Section title={t("top")}>
        <DataTable stack empty={t("empty")} numeric={[1, 2, 3]} head={[tc("product"), t("units"), t("revenue"), t("profit")]}>
          {report.topProducts.map((p) => (
            <tr key={p.sku}>
              <Td>
                <span className="block font-medium break-words">{p.name}</span>
                <span className="block font-mono text-xs break-all text-muted-foreground">{p.sku}</span>
              </Td>
              <Td label={t("units")} numeric>{fmtInt(p.units)}</Td>
              <Td label={t("revenue")} numeric>{fmtInt(p.revenue)}</Td>
              <Td label={t("profit")} numeric>{fmtInt(p.profit)}</Td>
            </tr>
          ))}
        </DataTable>
      </Section>
    </Page>
  );
}
