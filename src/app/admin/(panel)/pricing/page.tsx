import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { createRateAction, previewRunAction } from "@/server/pricing/actions";
import { listPriceHistory, listRates, listRuns, pricingFilterOptions, variantsWithoutCost } from "@/server/pricing/queries";
import { getNumberSetting } from "@/server/settings";
import { ActionForm } from "@/components/admin/action-form";
import { RateInputs } from "@/components/admin/rate-inputs";
import { Badge, DataTable, fieldClass, Page, PageHeader, Td } from "@/components/admin/ui";
import { rateDisplay } from "@/server/pricing/formula";
import { fmtDateTime, fmtDecimal, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

const RUN_TONE = { PREVIEW: "warning", APPLIED: "success", CANCELLED: "neutral" } as const;

export default async function PricingPage() {
  await requirePagePermission("pricing:manage");
  const [t, rates, runs, history, options, noCost, roundTo] = await Promise.all([
    getTranslations("Pricing"),
    listRates(),
    listRuns(),
    listPriceHistory(),
    pricingFilterOptions(),
    variantsWithoutCost(),
    getNumberSetting("pricing.roundTo"),
  ]);

  return (
    <Page>
      <PageHeader title={t("title")} />

      <section className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <div className="space-y-3">
          <h2 className="font-medium">{t("rates")}</h2>
          <DataTable stack empty={t("noRate")} head={[t("colUsd"), t("colCross"), t("effectiveAt"), t("note")]}>
            {rates.map((r) => {
              const d = rateDisplay(r);
              return (
                <tr key={r.id}>
                  <Td label={t("colUsd")} className="whitespace-nowrap tabular-nums">
                    {r.mmkPerUsd && r.vndPerUsd ? (
                      <>
                        <div>{fmtDecimal(r.mmkPerUsd)} MMK</div>
                        <div>{fmtDecimal(r.vndPerUsd)} VND</div>
                      </>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td label={t("colCross")} className="whitespace-nowrap tabular-nums">
                    <div className="font-medium">1 MMK = {d.vndPerMmk} VND</div>
                    <div className="text-xs text-muted-foreground">1 VND = {d.mmkPerVnd} MMK</div>
                  </Td>
                  <Td label={t("effectiveAt")} className="whitespace-nowrap">
                    {fmtDateTime(r.effectiveAt)}
                  </Td>
                  <Td label={t("note")}>{r.note}</Td>
                </tr>
              );
            })}
          </DataTable>
          <ActionForm action={createRateAction} submitLabel={t("addRate")} okText={t("rateAdded")} className="flex flex-wrap items-end gap-2">
            <RateInputs />
            <label className="grid content-start gap-1 text-sm">
              <span className="text-muted-foreground">{t("note")}</span>
              <input name="note" maxLength={200} className={cn(fieldClass, "w-48")} />
            </label>
          </ActionForm>
        </div>

        <div className="space-y-3">
          <h2 className="font-medium">{t("newRun")}</h2>
          <p className="text-xs text-muted-foreground">{t("formula")}</p>
          {rates.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noRate")}</p>
          ) : (
            <ActionForm action={previewRunAction} submitLabel={t("preview")} className="grid gap-2 sm:grid-cols-2">
              <label className="grid content-start gap-1 text-sm">
                <span className="text-muted-foreground">{t("rate")}</span>
                <select name="rateId" defaultValue={rates[0].id} className={fieldClass}>
                  {rates.map((r) => (
                    <option key={r.id} value={r.id}>
                      1 MMK = {rateDisplay(r).vndPerMmk} VND · {fmtDateTime(r.effectiveAt)}
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
            <p className="text-xs text-muted-foreground">
              {t("noCost")}: <span className="font-mono">{noCost.join(", ")}</span>
            </p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">{t("runs")}</h2>
        <DataTable empty={t("empty")} head={[t("created"), t("rate"), t("marginPct"), t("lines"), t("status")]}>
          {runs.map((r) => (
            <tr key={r.id}>
              <Td>
                <Link href={`/admin/pricing/runs/${r.id}`} className="text-primary underline">
                  {fmtDateTime(r.createdAt)}
                </Link>
              </Td>
              <Td className="tabular-nums">{rateDisplay(r.rate).vndPerMmk}</Td>
              <Td>{r.marginPct.toString()}%</Td>
              <Td className="text-right">{r._count.lines}</Td>
              <Td>
                <Badge tone={RUN_TONE[r.status]}>{t(`st.${r.status}`)}</Badge>
              </Td>
            </tr>
          ))}
        </DataTable>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">{t("history")}</h2>
        <DataTable empty={t("empty")} head={[t("created"), t("sku"), t("oldPrice"), t("newPrice"), t("reason")]}>
          {history.map((h) => (
            <tr key={h.id}>
              <Td className="whitespace-nowrap">{fmtDateTime(h.createdAt)}</Td>
              <Td className="font-mono text-xs">
                {h.variant.sku} <span className="text-muted-foreground">({h.variant.label})</span>
              </Td>
              <Td className="text-right tabular-nums">{fmtInt(h.oldPriceMmk)}</Td>
              <Td className="text-right tabular-nums">{fmtInt(h.newPriceMmk)}</Td>
              <Td>{h.reason === "bulk" ? t("reasonBulk") : h.reason === "manual" ? t("reasonManual") : h.reason}</Td>
            </tr>
          ))}
        </DataTable>
      </section>
    </Page>
  );
}
