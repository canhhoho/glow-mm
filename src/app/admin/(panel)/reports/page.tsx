import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import {
  defaultRange,
  inboundShipments,
  salesReport,
  slowMovers,
  stockByLocation,
  type Range,
} from "@/server/reports/queries";
import { DataTable, fieldClass, fieldLabelClass, FilterButton, Notice, Page, PageHeader, Stat, Td } from "@/components/admin/ui";
import { ReportsTabs } from "@/components/admin/reports-tabs";
import { fmtDay, fmtInt } from "@/lib/format";
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
  const [t, report, slow, inbound, stock] = await Promise.all([
    getTranslations("Reports"),
    salesReport(range),
    slowMovers(),
    inboundShipments(),
    stockByLocation(),
  ]);
  const { totals } = report;
  const maxRevenue = Math.max(1, ...report.daily.map((d) => d.revenue));

  return (
    <Page>
      <PageHeader title={(await getTranslations("Nav"))("salesReports")} description={t("basis")} />
      <ReportsTabs active="sales" />
      {/* key theo kỳ: điều hướng phía client giữ DOM → defaultValue cũ; đổi key để ô ngày hiện kỳ đã chuẩn hoá. */}
      <form key={`${range.from}|${range.to}`} className="flex flex-wrap items-end gap-2">
        <label className={fieldLabelClass}>
          <span className="text-muted-foreground">{t("from")}</span>
          <input type="date" name="from" defaultValue={range.from} className={cn(fieldClass, "w-40")} />
        </label>
        <label className={fieldLabelClass}>
          <span className="text-muted-foreground">{t("to")}</span>
          <input type="date" name="to" defaultValue={range.to} className={cn(fieldClass, "w-40")} />
        </label>
        <FilterButton>{(await getTranslations("Common"))("filter")}</FilterButton>
      </form>

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
        <p role="status" className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
          {t("estimatedCost")} <span className="font-mono">{report.estimatedCostOrders.slice(0, 10).join(", ")}</span>
          {report.estimatedCostOrders.length > 10 && ` ${t("andMore", { count: report.estimatedCostOrders.length - 10 })}`}
        </p>
      )}

      <section className="space-y-2">
        <h2 className="font-medium">{t("daily")}</h2>
        <DataTable empty={t("empty")} head={[t("day"), t("orders"), t("revenue"), "", t("cogs"), t("profit")]}>
          {report.daily
            .filter((d) => d.orders > 0)
            .map((d) => (
              <tr key={d.day}>
                <Td className="whitespace-nowrap">{d.day}</Td>
                <Td className="text-right tabular-nums">{d.orders}</Td>
                <Td className="text-right tabular-nums">{fmtInt(d.revenue)}</Td>
                <Td className="w-1/3">
                  <div className="h-2 rounded bg-primary/70" style={{ width: `${(Math.max(0, d.revenue) / maxRevenue) * 100}%` }} />
                </Td>
                <Td className="text-right tabular-nums">{fmtInt(d.cogs)}</Td>
                <Td className="text-right tabular-nums">{fmtInt(d.profit)}</Td>
              </tr>
            ))}
        </DataTable>
      </section>

      <section className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <div className="space-y-2">
          <h2 className="font-medium">{t("top")}</h2>
          <DataTable empty={t("empty")} head={["SKU", t("units"), t("revenue"), t("profit")]}>
            {report.topProducts.map((p) => (
              <tr key={p.sku}>
                <Td>
                  <span className="font-mono text-xs">{p.sku}</span>
                  <div className="text-xs text-muted-foreground">{p.name}</div>
                </Td>
                <Td className="text-right tabular-nums">{fmtInt(p.units)}</Td>
                <Td className="text-right tabular-nums">{fmtInt(p.revenue)}</Td>
                <Td className="text-right tabular-nums">{fmtInt(p.profit)}</Td>
              </tr>
            ))}
          </DataTable>
        </div>
        <div className="space-y-2">
          <h2 className="font-medium">{t("slow", { days: slow.days })}</h2>
          <DataTable empty={t("empty")} head={["SKU", t("available")]}>
            {slow.items.slice(0, 20).map((v) => (
              <tr key={v.variantId}>
                <Td>
                  <span className="font-mono text-xs">{v.sku}</span>
                  <div className="text-xs text-muted-foreground">{v.name}</div>
                </Td>
                <Td className="text-right tabular-nums">{fmtInt(v.available)}</Td>
              </tr>
            ))}
          </DataTable>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <div className="space-y-2">
          <h2 className="font-medium">{t("stock")}</h2>
          <DataTable head={[t("locType"), t("qty"), t("tester"), t("value"), t("estimatedQty"), t("noCost")]}>
            {stock.map((s) => (
              <tr key={s.code ?? "inactive"} data-testid={`stock-${s.code ?? "inactive"}`}>
                <Td>{s.name ?? t("inactiveLocations")}</Td>
                <Td className="text-right tabular-nums">{fmtInt(s.qty)}</Td>
                <Td className="text-right tabular-nums">{fmtInt(s.testerQty)}</Td>
                <Td className="text-right tabular-nums">{fmtInt(s.valueMmk)}</Td>
                <Td className="text-right tabular-nums">{s.estimatedQty ? fmtInt(s.estimatedQty) : "—"}</Td>
                <Td className="text-right tabular-nums">{s.missingCost ? fmtInt(s.missingCost) : "—"}</Td>
              </tr>
            ))}
          </DataTable>
        </div>
        <div className="space-y-2">
          <h2 className="font-medium">{t("inbound")}</h2>
          <DataTable empty={t("empty")} head={[t("shipment"), t("departed"), t("batches"), t("costs")]}>
            {inbound.map((s) => (
              <tr key={s.id}>
                <Td className="font-mono text-xs">{s.code}</Td>
                <Td>{fmtDay(s.departedAt)}</Td>
                <Td className="text-right tabular-nums">{s.batches}</Td>
                <Td className="text-right tabular-nums">{fmtInt(s.costsVnd)}</Td>
              </tr>
            ))}
          </DataTable>
        </div>
      </section>
    </Page>
  );
}
