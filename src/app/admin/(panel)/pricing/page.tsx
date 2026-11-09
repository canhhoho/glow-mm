import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { createRateAction } from "@/server/pricing/actions";
import {
  countPreviewRuns,
  listPriceHistory,
  listRates,
} from "@/server/pricing/queries";
import { PricingRunsTab } from "@/components/admin/pricing-runs-tab";
import { ActionForm } from "@/components/admin/action-form";
import { RateInputs } from "@/components/admin/rate-inputs";
import { Badge, DataTable, fieldClass, fieldLabelClass, Page, PageHeader, Section, TabNav, Td } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { rateDisplay } from "@/server/pricing/formula";
import { fmtDateTime, fmtDecimal, fmtInt } from "@/lib/format";


/** Tab: tỷ giá (mặc định) · tính giá (form + các lần tính) · lịch sử giá. Mỗi tab chỉ tải dữ liệu của nó. */
const TABS = ["rates", "runs", "history"] as const;
type Tab = (typeof TABS)[number];

export default async function PricingPage({ searchParams }: PageProps<"/admin/pricing">) {
  await requirePagePermission("pricing:manage");
  const { tab: rawTab, receiptId, productId } = await searchParams;
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
      {tab === "runs" && (
        <PricingRunsTab receiptId={typeof receiptId === "string" ? receiptId : undefined} productId={typeof productId === "string" ? productId : undefined} />
      )}
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
          className="grid grid-cols-2 gap-x-2 gap-y-3 [&>div:last-of-type]:col-span-full" icon={<Plus aria-hidden className="size-4 shrink-0" />}
        >
          <RateInputs />
          <label className={cn(fieldLabelClass, "col-span-full")}>
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
