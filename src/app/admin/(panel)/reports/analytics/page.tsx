import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { analyticsReport } from "@/server/analytics/queries";
import { FUNNEL_KEYS } from "@/server/analytics/funnel";
import { defaultRange } from "@/server/reports/queries";
import { addDays } from "@/lib/time";
import { fmtDateTime, fmtInt } from "@/lib/format";
import { ReportsTabs } from "@/components/admin/reports-tabs";
import { DataTable, fieldClass, fieldLabelClass, FilterBar, FilterButton, Notice, Page, PageHeader, Section, Stat, Td } from "@/components/admin/ui";

export default async function AnalyticsPage({ searchParams }: PageProps<"/admin/reports/analytics">) {
  await requirePagePermission("reports:view");
  const sp = await searchParams;
  const defaults = defaultRange();
  const validDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
  let from = validDay(sp.from) ? sp.from : defaults.from;
  let to = validDay(sp.to) ? sp.to : defaults.to;
  if (from > to) [from, to] = [to, from];
  if (from < addDays(to, -89)) from = addDays(to, -89);
  const [t, report] = await Promise.all([getTranslations("Analytics"), analyticsReport({ from, to })]);
  return <Page>
    <PageHeader title={t("title")} description={t("basis")} />
    <ReportsTabs active="analytics" />
    {!report.enabled && <Notice>{t("disabled")}</Notice>}
    <FilterBar key={`${from}|${to}`}>
      <label className={fieldLabelClass}><span>{t("from")}</span><input name="from" type="date" defaultValue={from} className={fieldClass} /></label>
      <label className={fieldLabelClass}><span>{t("to")}</span><input name="to" type="date" defaultValue={to} className={fieldClass} /></label>
      <FilterButton>{(await getTranslations("Common"))("filter")}</FilterButton>
    </FilterBar>
    <p className="text-sm text-muted-foreground">{t("collection", { started: report.startedAt ? fmtDateTime(report.startedAt) : "—", days: report.activeDays })}</p>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label={t("step.view")} value={fmtInt(report.total.view)} testId="analytics-view" />
      <Stat label={t("step.purchase")} value={fmtInt(report.total.purchase)} testId="analytics-purchase" />
      <Stat label={t("step.completed")} value={fmtInt(report.total.completed)} />
      <Stat label={t("conversion")} value={report.conversionPct == null ? "—" : `${report.conversionPct}%`} />
    </div>
    <DataTable numeric={[1, 2, 3, 4]} empty={t("empty")} head={[t("stepLabel"), t("all"), t("mobile"), t("desktop"), t("unknown")]}>
      {FUNNEL_KEYS.map((key) => <tr key={key}><Td>{t(`step.${key}`)}</Td><Td numeric>{fmtInt(report.total[key])}</Td><Td numeric>{fmtInt(report.groups.mobile[key])}</Td><Td numeric>{fmtInt(report.groups.desktop[key])}</Td><Td numeric>{fmtInt(report.groups.unknown[key])}</Td></tr>)}
    </DataTable>
    <Section title={t("vitals")}>
      <p className="text-sm text-muted-foreground">{t("vitalsHelp")}</p>
      <DataTable head={[t("pageType"), t("device"), t("metric"), t("samples"), "p75"]} numeric={[3, 4]} empty={t("empty")}>
        {report.vitals.map((v) => <tr key={`${v.device}|${v.pageType}|${v.metric}`}><Td>{t(`page.${v.pageType}`)}</Td><Td>{v.device === "mobile" ? t("mobile") : v.device === "desktop" ? t("desktop") : t("unknown")}</Td><Td>{v.metric}</Td><Td numeric>{fmtInt(v.samples)}</Td><Td numeric>{v.metric === "CLS" ? v.p75.toFixed(3) : `${Math.round(v.p75)} ms`}</Td></tr>)}
      </DataTable>
    </Section>
  </Page>;
}
