import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { createRateAction, previewRunAction } from "@/server/pricing/actions";
import {
  countPreviewRuns,
  listPriceHistory,
  listRates,
  listRuns,
  pricingFilterOptions,
  variantsWithoutCost,
} from "@/server/pricing/queries";
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
  const [t, rates, runs, options, noCost, roundTo] = await Promise.all([
    getTranslations("Pricing"),
    listRates(),
    listRuns(),
    pricingFilterOptions(),
    variantsWithoutCost(),
    getNumberSetting("pricing.roundTo"),
  ]);
  return (
    <>
      <Section title={t("newRun")} className="max-w-3xl">
        <p className="text-xs text-muted-foreground">{t("formula")}</p>
        {rates.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noRate")}</p>
        ) : (
          <ActionForm action={previewRunAction} submitLabel={t("preview")} className="grid gap-3 sm:grid-cols-2">
            <label className="grid content-start gap-1 text-sm">
              <span className="text-muted-foreground">{t("rate")}</span>
              <select name="rateId" defaultValue={rates[0].id} className={fieldClass}>
                {rates.map((r) => (
                  <option key={r.id} value={r.id}>
                    1 MMK = {rateDisplay(r).vndPerMmk} VND · {fmtDate(r.effectiveAt)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid content-start gap-1 text-sm">
              <span className="text-muted-foreground">{t("marginPct")}</span>
              <input name="marginPct" required inputMode="decimal" placeholder="40" className={fieldClass} />
            </label>
            <label className="grid content-start gap-1 text-sm">
              <span className="text-muted-foreground">{t("roundTo")}</span>
              <input name="roundTo" type="number" min={1} defaultValue={roundTo} className={fieldClass} />
            </label>
            <label className="grid content-start gap-1 text-sm">
              <span className="text-muted-foreground">{t("category")}</span>
              <select name="categoryId" defaultValue="" className={fieldClass}>
                <option value="">{t("all")}</option>
                {options.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid content-start gap-1 text-sm">
              <span className="text-muted-foreground">{t("brand")}</span>
              <select name="brandId" defaultValue="" className={fieldClass}>
                <option value="">{t("all")}</option>
                {options.brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          </ActionForm>
        )}
        {noCost.length > 0 && (
          <p className="text-xs break-words text-muted-foreground">
            {t("noCost")}: <span className="font-mono">{noCost.join(", ")}</span>
          </p>
        )}
      </Section>

      <section className="space-y-3">
        <h2 className="font-medium">{t("runs")}</h2>
        <DataTable
          stack
          empty={t("empty")}
          numeric={[3]}
          head={[t("created"), t("rate"), t("marginPct"), t("lines"), t("status")]}
        >
          {runs.map((r) => (
            <tr key={r.id}>
              <Td>
                <Link href={`/admin/pricing/runs/${r.id}`} className="whitespace-nowrap text-primary underline">
                  {fmtDateTime(r.createdAt)}
                </Link>
              </Td>
              <Td label={t("rate")} className="tabular-nums">
                1 MMK = {rateDisplay(r.rate).vndPerMmk} VND
              </Td>
              <Td label={t("marginPct")}>{r.marginPct.toString()}%</Td>
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
