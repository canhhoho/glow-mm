import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { Download } from "lucide-react";
import { SALES_RANGE, salesReport } from "@/server/reports/queries";
import { DataTable, DateRangeFields, FilterBar, FilterButton, Notice, Page, PageHeader, Section, Stat, Td } from "@/components/admin/ui";
import { buttonVariants } from "@/components/ui/button";
import { ReportsTabs } from "@/components/admin/reports-tabs";
import { datePresetItems, presetLabels, requiredRange } from "@/lib/date-range";
import { fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  await requirePagePermission("reports:view");
  // Nhập ngược → đảo lại; dài quá 366 ngày → cắt (lib/date-range, dùng chung với xuất Excel).
  const range = requiredRange(await searchParams, SALES_RANGE);
  const [t, tc, report] = await Promise.all([
    getTranslations("Reports"),
    getTranslations("Common"),
    salesReport(range),
  ]);
  const { totals } = report;
  const maxRevenue = Math.max(1, ...report.daily.map((d) => d.revenue));

  return (
    <Page>
      <PageHeader
        title={(await getTranslations("Nav"))("salesReports")}
        description={t("basis")}
        actions={
          <a href={`/api/admin/reports/sales-export?from=${range.from}&to=${range.to}`} download className={buttonVariants({ variant: "outline", size: "lg" })} data-testid="sales-export">
            <Download aria-hidden /> {t("exportExcel")}
          </a>
        }
      />
      <ReportsTabs active="sales" />
      {/* key theo kỳ: điều hướng phía client giữ DOM → defaultValue cũ; đổi key để ô ngày hiện kỳ đã chuẩn hoá. */}
      <FilterBar key={`${range.from}|${range.to}`}>
        <DateRangeFields
          from={range.from}
          to={range.to}
          fromLabel={t("from")}
          toLabel={t("to")}
          presetsLabel={tc("datePresets")}
          presets={datePresetItems(presetLabels(tc), (r) => `/admin/reports?from=${r.from}&to=${r.to}`, range)}
        />
        <FilterButton>{tc("filter")}</FilterButton>
      </FilterBar>

      {/* 20/11/2026 (audit): 4 ô chính + bảng "từ doanh thu đến lợi nhuận" thay 12 ô ngang hàng — thấy rõ số nào trừ số nào.
          Số liệu / công thức giữ nguyên (salesReport): hoa hồng CTV đã gồm tuyến dưới; phí ship thu tách khỏi doanh thu. */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={`${t("revenue")} (MMK)`} value={fmtInt(totals.revenue)} hint={totals.returnedRevenue ? `${t("returns")}: ${fmtInt(totals.returnedRevenue)}` : undefined} testId="r-revenue" />
        <Stat label={t("orders")} value={totals.orders} testId="r-orders" />
        <Stat label={`${t("profit")} (MMK)`} value={fmtInt(totals.profit)} hint={totals.marginPct == null ? undefined : `${t("margin")} ${totals.marginPct}%`} testId="r-profit" />
        <Stat label={`${t("profitAfterRecordedCosts")} (MMK)`} value={fmtInt(totals.profitAfterRecordedCosts)} testId="r-recorded-profit" />
      </section>
      <Section title={t("profitChain")}>
        <DataTable numeric={[1]} cols={["", "w-40 sm:w-48"]} tableClassName="table-fixed" head={[t("chainItem"), "MMK"]}>
          {(
            [
              ["", t("revenue"), totals.revenue, "r-chain-revenue", false],
              ["−", t("cogs"), totals.cogs, "r-cogs", false],
              ["=", t("profit"), totals.profit, "r-chain-profit", true],
              ["−", t("commission"), totals.commission, "r-commission", false],
              ["=", t("profitAfterCommission"), totals.profitAfterCommission, "r-chain-after-commission", true],
              ["−", t("codCarrierFees"), totals.codCarrierFees, "r-cod-fees", false],
              ["=", t("profitAfterRecordedCosts"), totals.profitAfterRecordedCosts, "r-chain-recorded", true],
            ] as const
          ).map(([sign, label, value, id, subtotal]) => (
            <tr key={id} className={cn(subtotal && "bg-muted/30 font-medium")}>
              <Td>
                <span className="inline-block w-4 text-muted-foreground">{sign}</span>
                {label}
                {id === "r-commission" && totals.uplineCommission > 0 && (
                  <span className="block pl-4 text-xs text-muted-foreground">{t("uplineCommission")}: {fmtInt(totals.uplineCommission)}</span>
                )}
              </Td>
              <Td numeric><span data-testid={id}>{fmtInt(value)}</span></Td>
            </tr>
          ))}
        </DataTable>
        <p className="text-xs text-muted-foreground">{t("shippingFees")}: {fmtInt(totals.shippingFees)} MMK — {t("shippingFeesNote")}</p>
      </Section>
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
