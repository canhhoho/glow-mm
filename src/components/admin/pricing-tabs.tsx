import Link from "next/link";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createRateAction } from "@/server/pricing/actions";
import { listPriceHistory, listRates } from "@/server/pricing/queries";
import { rateDisplay } from "@/server/pricing/formula";
import { productName } from "@/server/inventory/queries";
import { IMPORT_PRICE_PREFIX, MANUAL_PRICE_PREFIX } from "@/server/catalog/product-pricing";
import { ActionForm } from "@/components/admin/action-form";
import { RateInputs } from "@/components/admin/rate-inputs";
import { Badge, DataTable, fieldClass, fieldLabelClass, Section, Td } from "@/components/admin/ui";
import { fmtDateTime, fmtDecimal, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Tab "Tỷ giá" và "Lịch sử giá" của trang Giá bán (`/admin/selling-prices?mode=rates|history`). Gộp từ trang
 * "Giá & tỷ giá" cũ (16/11/2026) — trang Giá bán là nơi quản lý giá chính; `/admin/pricing` chỉ còn chuyển hướng.
 */

export async function RatesTab() {
  const [t, rates] = await Promise.all([getTranslations("Pricing"), listRates()]);
  return (
    <div className="grid items-start gap-5 lg:grid-cols-5">
      <Section title={t("addRate")} className="lg:col-span-2">
        <ActionForm
          action={createRateAction}
          submitLabel={t("addRate")}
          okText={t("rateAdded")}
          className="grid grid-cols-2 gap-x-2 gap-y-3 [&>div:last-of-type]:col-span-full"
          icon={<Plus aria-hidden className="size-4 shrink-0" />}
        >
          <RateInputs />
          <label className={cn(fieldLabelClass, "col-span-full")}>
            <span className="text-muted-foreground">{t("note")}</span>
            <input name="note" maxLength={200} className={fieldClass} />
          </label>
        </ActionForm>
      </Section>

      <Section title={t("rates")} className="lg:col-span-3">
        <DataTable empty={t("noRate")} head={[t("rate"), t("effectiveAt")]}>
          {rates.map((r, i) => {
            const d = rateDisplay(r);
            return (
              <tr key={r.id} className={cn(i === 0 && "bg-success-muted/40")}>
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
      </Section>
    </div>
  );
}

export async function PriceHistoryTab() {
  const [t, history] = await Promise.all([getTranslations("Pricing"), listPriceHistory()]);
  const source = (h: (typeof history)[number]) =>
    h.runId && h.run?.mode !== "MANUAL" ? (
      <Link href={`/admin/pricing/runs/${h.runId}`}>
        <Badge tone="brand">{t("srcRun")}</Badge>
      </Link>
    ) : h.reason === "import" || h.reason?.startsWith(IMPORT_PRICE_PREFIX) ? (
      <Badge tone="neutral">{t("srcImport")}</Badge>
    ) : (
      <Badge tone="neutral">{t("srcManual")}</Badge>
    );
  const reason = (r: string | null) =>
    !r ? "—" : r === "bulk" ? t("reasonBulk") : r === "manual" ? t("reasonManual") : r.startsWith(MANUAL_PRICE_PREFIX) ? r.slice(MANUAL_PRICE_PREFIX.length) : r.startsWith(IMPORT_PRICE_PREFIX) ? "—" : r;
  return (
    <DataTable
      stack
      empty={t("empty")}
      numeric={[3, 4]}
      head={[t("created"), t("product"), t("sku"), t("oldPrice"), t("newPrice"), t("historySource"), t("reason")]}
    >
      {history.map((h) => {
        const delta = h.oldPriceMmk > 0 ? ((h.newPriceMmk - h.oldPriceMmk) / h.oldPriceMmk) * 100 : null;
        return (
          <tr key={h.id}>
            <Td className="whitespace-nowrap tabular-nums max-md:font-medium">{fmtDateTime(h.createdAt)}</Td>
            <Td label={t("product")}>
              <Link href={`/admin/products/${h.variant.productId}`} className="hover:text-primary">
                {productName(h.variant.product.translations, h.variant.product.slug)}
              </Link>
            </Td>
            <Td label={t("sku")} className="font-mono text-xs">
              {h.variant.sku} <span className="text-muted-foreground">({h.variant.label})</span>
            </Td>
            <Td label={t("oldPrice")} className="tabular-nums md:text-right">
              {fmtInt(h.oldPriceMmk)}
            </Td>
            <Td label={t("newPrice")} className="whitespace-nowrap tabular-nums md:text-right">
              <span className="font-medium">{fmtInt(h.newPriceMmk)}</span>
              {delta != null && delta !== 0 && (
                <span className={cn("ml-1.5 inline-flex items-center text-xs", delta > 0 ? "text-success" : "text-destructive")}>
                  {delta > 0 ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />}
                  {Math.abs(delta).toFixed(1)}%
                </span>
              )}
            </Td>
            <Td label={t("historySource")}>{source(h)}</Td>
            <Td label={t("reason")} className="text-sm">{reason(h.reason)}</Td>
          </tr>
        );
      })}
    </DataTable>
  );
}
