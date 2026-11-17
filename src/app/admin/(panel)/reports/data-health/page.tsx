import { Download } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { dataHealth, LONG_SHIPPING_DAYS, STALE_DRAFT_DAYS, type HealthCheck, type Percentiles } from "@/server/reports/data-health";
import { ReportsTabs } from "@/components/admin/reports-tabs";
import { buttonVariants } from "@/components/ui/button";
import { Badge, DataTable, Page, PageHeader, Section, Segmented, Td } from "@/components/admin/ui";
import { fmtDateTime, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

const PERIODS = [30, 90] as const;
const SEVERITY_TONE = { error: "danger", warning: "warning", info: "neutral" } as const;
const TITLE_PARAMS: Partial<Record<HealthCheck["key"], { days: number }>> = {
  longShipping: { days: LONG_SHIPPING_DAYS },
  staleDrafts: { days: STALE_DRAFT_DAYS },
};
const fmtHours = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 1 }));

export default async function DataHealthPage({ searchParams }: PageProps<"/admin/reports/data-health">) {
  await requirePagePermission("reports:view");
  const sp = await searchParams;
  const days = PERIODS.find((p) => String(p) === sp.days) ?? 30;
  const [t, to, report] = await Promise.all([getTranslations("DataHealth"), getTranslations("Orders"), dataHealth(new Date(), days)]);
  const b = report.baseline;
  const flowRows: [string, Percentiles][] = [
    [t("baseline.createdToConfirmed"), b.flow.createdToConfirmed],
    [t("baseline.confirmedToShipped"), b.flow.confirmedToShipped],
    [t("baseline.createdToShipped"), b.flow.createdToShipped],
    [t("baseline.shippedToCompleted"), b.flow.shippedToCompleted],
    [t("baseline.receiveToPrice"), b.receiveToPrice],
  ];

  return (
    <Page>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <a
            href={`/api/admin/reports/data-health?days=${days}`}
            download
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            <Download aria-hidden />
            {t("download")}
          </a>
        }
      />
      <ReportsTabs active="health" />
      <p className="text-xs text-muted-foreground">{t("generatedAt", { time: fmtDateTime(new Date(report.generatedAt)) })}</p>

      {report.groups.map((g) => (
        <Section key={g.key} title={t(`groups.${g.key}`)} testId={`health-${g.key}`}>
          <div className="space-y-2">
            {g.checks.map((c) => (
              <details key={c.key} open={c.count > 0 && c.severity === "error"} className="rounded-lg border" data-testid={`check-${c.key}`}>
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <Badge tone={c.count === 0 ? "success" : SEVERITY_TONE[c.severity]}>
                    {c.count === 0 ? t("none") : t(`sev.${c.severity}`)}
                  </Badge>
                  <span className="font-medium">{t(`checks.${c.key}.title`, TITLE_PARAMS[c.key] ?? {})}</span>
                  <span className={cn("ml-auto tabular-nums", c.count > 0 ? "font-medium" : "text-muted-foreground")} data-testid="check-count">
                    {fmtInt(c.count)}
                  </span>
                </summary>
                <div className="space-y-2 border-t px-3 py-2">
                  <p className="text-xs text-muted-foreground">{t(`checks.${c.key}.help`)}</p>
                  {c.count > 0 && (
                    <DataTable head={[t("colRef"), t("colName"), ...(t(`checks.${c.key}.value`) ? [t(`checks.${c.key}.value`)] : [])]} stack>
                      {c.rows.map((r) => (
                        <tr key={r.id}>
                          <Td>
                            <Link href={r.href} className="font-mono text-xs text-primary underline">
                              {r.ref}
                            </Link>
                          </Td>
                          <Td label={t("colName")}>{r.name ?? "—"}</Td>
                          {t(`checks.${c.key}.value`) && (
                            <Td label={t(`checks.${c.key}.value`)} className="tabular-nums">
                              {c.key === "noImage" && r.value ? t(`state.${r.value as "published" | "hidden"}`) : (r.value ?? "")}
                            </Td>
                          )}
                        </tr>
                      ))}
                    </DataTable>
                  )}
                  {c.count > c.rows.length && <p className="text-xs text-muted-foreground">{t("more", { count: c.count - c.rows.length })}</p>}
                </div>
              </details>
            ))}
          </div>
        </Section>
      ))}

      <Section
        title={t("baseline.title")}
        testId="health-baseline"
        actions={
          <Segmented label={t("period")} items={PERIODS.map((p) => ({ href: `/admin/reports/data-health?days=${p}`, label: t("days", { days: p }), active: p === days }))} />
        }
      >
        <p className="text-xs text-muted-foreground">{t("baseline.help")}</p>
        <DataTable stack head={[t("baseline.step"), t("baseline.n"), t("baseline.p50"), t("baseline.p90")]} numeric={[1, 2, 3]}>
          {flowRows.map(([label, p]) => (
            <tr key={label}>
              <Td className="max-md:font-medium">{label}</Td>
              <Td label={t("baseline.n")} numeric>{fmtInt(p.n)}</Td>
              <Td label={t("baseline.p50")} numeric>{fmtHours(p.p50)}</Td>
              <Td label={t("baseline.p90")} numeric>{fmtHours(p.p90)}</Td>
            </tr>
          ))}
        </DataTable>
        {b.receiveToPrice.neverPriced > 0 && (
          <p className="text-xs text-muted-foreground">{t("baseline.neverPriced", { count: b.receiveToPrice.neverPriced })}</p>
        )}

        <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
          <div className="space-y-2">
            <h3 className="text-sm font-medium">{t("baseline.ordersByStatus")}</h3>
            <DataTable head={[t("baseline.status"), t("baseline.count")]} numeric={[1]}>
              {b.ordersByStatus.map((r) => (
                <tr key={r.status}>
                  <Td>{to(`status.${r.status}`)}</Td>
                  <Td numeric>{fmtInt(r.count)}</Td>
                </tr>
              ))}
            </DataTable>
            <p className="text-sm">
              {t("baseline.commissionPaid")}: <span className="tabular-nums">{fmtInt(b.commissionPaidMmk)}</span>
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-medium">{t("baseline.cod")}</h3>
            <DataTable head={[t("baseline.age"), t("baseline.count"), t("baseline.amount")]} numeric={[1, 2]}>
              {b.cod.buckets.map((r) => (
                <tr key={r.label}>
                  <Td>{r.label}</Td>
                  <Td numeric>{fmtInt(r.orders)}</Td>
                  <Td numeric>{fmtInt(r.mmk)}</Td>
                </tr>
              ))}
            </DataTable>
            <p className="text-sm">{t("baseline.codTotal", { count: b.cod.outstandingOrders, amount: fmtInt(b.cod.outstandingMmk) })}</p>
          </div>
        </div>
      </Section>
    </Page>
  );
}
