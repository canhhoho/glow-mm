import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { createRateAction } from "@/server/pricing/actions";
import {
  countPreviewRuns,
  lastShipRate,
  listPriceHistory,
  listRates,
  listRuns,
  pricingFilterOptions,
  pricingGaps,
} from "@/server/pricing/queries";
import { PricingRunForm } from "@/components/admin/pricing-run-form";
import { getNumberSetting } from "@/server/settings";
import { ActionForm } from "@/components/admin/action-form";
import { RateInputs } from "@/components/admin/rate-inputs";
import { Badge, DataTable, fieldClass, Page, PageHeader, Section, TabNav, Td } from "@/components/admin/ui";
import { rateDisplay } from "@/server/pricing/formula";
import { fmtDate, fmtDateTime, fmtDecimal, fmtInt } from "@/lib/format";

const RUN_TONE = { PREVIEW: "warning", APPLIED: "success", CANCELLED: "neutral" } as const;

/** Tab: tỷ giá (mặc định) · tính giá (form + các lần tính) · lịch sử giá. Mỗi tab chỉ tải dữ liệu của nó. */
const TABS = ["rates", "runs", "history"] as const;
type Tab = (typeof TABS)[number];

export default async function PricingPage({ searchParams }: PageProps<"/admin/pricing">) {
  await requirePagePermission("pricing:manage");
  const { tab: rawTab } = await searchParams;
  const tab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : "rates";
  const [t, previews] = await Promise.all([getTranslations("Pricing"), countPreviewRuns()]);
  const tabLabel: Record<Tab, string> = { rates: t("tabRates"), runs: t("tabRuns"), history: t("tabHistory") };

  return (
    <Page>
      <PageHeader title={t("title")} />
      <TabNav
        label={t("title")}
        tabs={TABS.map((k) => ({
          href: `/admin/pricing?tab=${k}`,
          active: k === tab,
          label: tabLabel[k],
          ...(k === "runs" && previews > 0 ? { count: previews, tone: "warning" as const } : {}),
        }))}
      />
      {tab === "rates" && <RatesTab />}
      {tab === "runs" && <RunsTab />}
      {tab === "history" && <HistoryTab />}
    </Page>
  );
}

async function RatesTab() {
  const [t, rates] = await Promise.all([getTranslations("Pricing"), listRates()]);
  return (
    <>
      <Section title={t("addRate")} className="max-w-xl">
        <ActionForm
          action={createRateAction}
          submitLabel={t("addRate")}
          okText={t("rateAdded")}
          className="grid grid-cols-2 gap-x-2 gap-y-3 [&>div:last-of-type]:col-span-full"
        >
          <RateInputs />
          <label className="col-span-full grid content-start gap-1 text-sm">
            <span className="text-muted-foreground">{t("note")}</span>
            <input name="note" maxLength={200} className={fieldClass} />
          </label>
        </ActionForm>
      </Section>

      <section className="space-y-3">
        <h2 className="font-medium">{t("rates")}</h2>
        <DataTable empty={t("noRate")} head={[t("rate"), t("effectiveAt")]}>
          {rates.map((r, i) => {
            const d = rateDisplay(r);
            return (
              <tr key={r.id}>
                <Td className="tabular-nums">
                  <div className="flex flex-wrap items-center gap-x-2 font-medium">
                    1 MMK = {d.vndPerMmk} VND
                    {i === 0 && <Badge tone="success">{t("current")}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">1 VND = {d.mmkPerVnd} MMK</div>
                  {r.mmkPerUsd && r.vndPerUsd && (
                    <div className="text-xs text-muted-foreground">
                      1 USD = {fmtDecimal(r.mmkPerUsd)} MMK · {fmtDecimal(r.vndPerUsd)} VND
                    </div>
                  )}
                </Td>
                <Td>
                  <div className="whitespace-nowrap">{fmtDateTime(r.effectiveAt)}</div>
                  {r.note && <div className="text-xs text-muted-foreground">{r.note}</div>}
                </Td>
              </tr>
            );
          })}
        </DataTable>
      </section>
    </>
  );
}

async function RunsTab() {
  const [t, rates, runs, options, gaps, roundTo, lastShip] = await Promise.all([
    getTranslations("Pricing"),
    listRates(),
    listRuns(),
    pricingFilterOptions(),
    pricingGaps(),
    getNumberSetting("pricing.roundTo"),
    lastShipRate(),
  ]);
  const gapLine = (label: string, skus: string[]) =>
    skus.length > 0 && (
      <p className="text-xs break-words text-muted-foreground">
        {label} ({skus.length}): <span className="font-mono">{skus.slice(0, 40).join(", ")}{skus.length > 40 ? " …" : ""}</span>
      </p>
    );
  return (
    <>
      <Section title={t("newRun")} className="max-w-3xl">
        <PricingRunForm
          warehouses={options.warehouses}
          rates={rates.map((r) => ({ id: r.id, label: `1 MMK = ${rateDisplay(r).vndPerMmk} VND · ${fmtDate(r.effectiveAt)}` }))}
          categories={options.categories}
          brands={options.brands}
          roundTo={roundTo}
          lastShip={lastShip}
        />
        {/* P24: biến thể bị bỏ qua khi tính giá — theo từng kho. */}
        {gaps.map((g) => (
          <div key={g.location.id} className="space-y-0.5">
            {(g.missingCost.length > 0 || g.missingWeight.length > 0 || g.missingProfit.length > 0) && (
              <p className="text-xs font-medium">{g.location.name}</p>
            )}
            {gapLine(t("noCost"), g.missingCost)}
            {gapLine(t("noWeight"), g.missingWeight)}
            {gapLine(t("noProfit"), g.missingProfit)}
          </div>
        ))}
      </Section>

      <section className="space-y-3">
        <h2 className="font-medium">{t("runs")}</h2>
        <DataTable
          stack
          empty={t("empty")}
          numeric={[4]}
          head={[t("created"), t("warehouse"), t("rate"), t("marginPct"), t("lines"), t("status")]}
        >
          {runs.map((r) => (
            <tr key={r.id}>
              <Td>
                <Link href={`/admin/pricing/runs/${r.id}`} className="whitespace-nowrap text-primary underline">
                  {fmtDateTime(r.createdAt)}
                </Link>
              </Td>
              <Td label={t("warehouse")}>{r.location?.name ?? "—"}</Td>
              <Td label={t("rate")} className="tabular-nums">
                {r.rate ? `1 MMK = ${rateDisplay(r.rate).vndPerMmk} VND` : "—"}
                {r.shipMmkPerKg != null && <div className="text-xs text-muted-foreground">{t("shipShort", { n: fmtInt(r.shipMmkPerKg) })}</div>}
              </Td>
              <Td label={t("marginPct")}>{r.marginPct != null ? `${r.marginPct.toString()}%` : t("fixedProfit")}</Td>
              <Td label={t("lines")} className="tabular-nums md:text-right">
                {r._count.lines}
              </Td>
              <Td label={t("status")}>
                <Badge tone={RUN_TONE[r.status]}>{t(`st.${r.status}`)}</Badge>
              </Td>
            </tr>
          ))}
        </DataTable>
      </section>
    </>
  );
}

async function HistoryTab() {
  const [t, history] = await Promise.all([getTranslations("Pricing"), listPriceHistory()]);
  return (
    <DataTable
      stack
      empty={t("empty")}
      numeric={[2, 3]}
      head={[t("created"), t("sku"), t("oldPrice"), t("newPrice"), t("reason")]}
    >
      {history.map((h) => (
        <tr key={h.id}>
          <Td className="whitespace-nowrap max-md:font-medium">{fmtDateTime(h.createdAt)}</Td>
          <Td label={t("sku")} className="font-mono text-xs">
            {h.variant.sku} <span className="text-muted-foreground">({h.variant.label})</span>
          </Td>
          <Td label={t("oldPrice")} className="tabular-nums md:text-right">
            {fmtInt(h.oldPriceMmk)}
          </Td>
          <Td label={t("newPrice")} className="font-medium tabular-nums md:text-right">
            {fmtInt(h.newPriceMmk)}
          </Td>
          <Td label={t("reason")}>
            {h.reason === "bulk" ? t("reasonBulk") : h.reason === "manual" ? t("reasonManual") : h.reason}
          </Td>
        </tr>
      ))}
    </DataTable>
  );
}
