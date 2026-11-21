import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { analyticsReport } from "@/server/analytics/queries";
import { FUNNEL_KEYS } from "@/server/analytics/funnel";
import { datePresetItems, presetLabels, requiredRange } from "@/lib/date-range";
import { fmtDateTime, fmtInt } from "@/lib/format";
import { ReportsTabs } from "@/components/admin/reports-tabs";
import { DataTable, DateRangeFields, FilterBar, FilterButton, Notice, Page, PageHeader, Stat, Td } from "@/components/admin/ui";

export default async function AnalyticsPage({ searchParams }: PageProps<"/admin/reports/analytics">) {
  await requirePagePermission("reports:view");
  const sp = await searchParams;
  // Khoảng ngày dùng chung (lib/date-range): mặc định 30 ngày, tối đa 90 ngày.
  const { from, to } = requiredRange(sp, { defaultDays: 30, maxDays: 90 });
  const [t, tc, report] = await Promise.all([getTranslations("Analytics"), getTranslations("Common"), analyticsReport({ from, to })]);
  return <Page>
    <PageHeader title={t("title")} description={t("basis")} />
    <ReportsTabs active="analytics" />
    {!report.enabled && <Notice>{t("disabled")}</Notice>}
    <FilterBar key={`${from}|${to}`}>
      <DateRangeFields from={from} to={to} fromLabel={t("from")} toLabel={t("to")} presetsLabel={tc("datePresets")} presets={datePresetItems(presetLabels(tc), (r) => `/admin/reports/analytics?from=${r.from}&to=${r.to}`, { from, to })} />
      <FilterButton>{tc("filter")}</FilterButton>
    </FilterBar>
    <p className="text-sm text-muted-foreground">{t("collection", { started: report.startedAt ? fmtDateTime(report.startedAt) : "—", days: report.activeDays })}</p>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label={t("step.view")} value={fmtInt(report.total.view)} testId="analytics-view" />
      <Stat label={t("step.purchase")} value={fmtInt(report.total.purchase)} testId="analytics-purchase" />
      <Stat label={t("step.completed")} value={fmtInt(report.total.completed)} />
      <Stat label={t("conversion")} value={report.conversionPct == null ? "—" : `${report.conversionPct}%`} />
    </div>
    <DataTable stack numeric={[1, 2, 3, 4]} empty={t("empty")} head={[t("stepLabel"), t("all"), t("mobile"), t("desktop"), t("unknown")]}>
      {FUNNEL_KEYS.map((key) => <tr key={key}><Td className="max-md:font-medium">{t(`step.${key}`)}</Td><Td label={t("all")} numeric>{fmtInt(report.total[key])}</Td><Td label={t("mobile")} numeric>{fmtInt(report.groups.mobile[key])}</Td><Td label={t("desktop")} numeric>{fmtInt(report.groups.desktop[key])}</Td><Td label={t("unknown")} numeric>{fmtInt(report.groups.unknown[key])}</Td></tr>)}
    </DataTable>
    {/* 21/11/2026 (audit #20): Web Vitals (kỹ thuật) dời sang Sức khoẻ dữ liệu. */}
    <p className="text-sm text-muted-foreground">{t("vitalsMoved")} <Link href="/admin/reports/data-health#web-vitals" className="text-primary underline">{t("vitalsMovedLink")}</Link></p>
  </Page>;
}
