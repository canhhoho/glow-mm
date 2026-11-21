import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { analyticsReport } from "@/server/analytics/queries";
import { FUNNEL_KEYS } from "@/server/analytics/funnel";
import { datePresetItems, presetLabels, requiredRange } from "@/lib/date-range";
import { fmtDateTime, fmtInt } from "@/lib/format";
import { ReportsTabs } from "@/components/admin/reports-tabs";
import { DataTable, DateRangeFields, FilterBar, FilterButton, Notice, Page, PageHeader, Section, Stat, Td } from "@/components/admin/ui";

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
    <Section title={t("vitals")}>
      <p className="text-sm text-muted-foreground">{t("vitalsHelp")}</p>
      <DataTable head={[t("pageType"), t("device"), t("metric"), t("samples"), "p75"]} numeric={[3, 4]} empty={t("empty")}>
        {report.vitals.map((v) => <tr key={`${v.device}|${v.pageType}|${v.metric}`}><Td>{t(`page.${v.pageType}`)}</Td><Td>{v.device === "mobile" ? t("mobile") : v.device === "desktop" ? t("desktop") : t("unknown")}</Td><Td>{v.metric}</Td><Td numeric>{fmtInt(v.samples)}</Td><Td numeric>{v.metric === "CLS" ? v.p75.toFixed(3) : `${Math.round(v.p75)} ms`}</Td></tr>)}
      </DataTable>
    </Section>
  </Page>;
}
