"use client";

import { useActionState, useState } from "react";
import { Check, Download, Eye } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { catalogImportAction } from "@/server/catalog/actions";
import type { CatalogImportPreview, ImportRowView } from "@/server/catalog/catalog-import";
import { Button, buttonVariants } from "@/components/ui/button";
import { FileField } from "@/components/admin/file-field";
import { Badge, DataTable, Notice, Td } from "@/components/admin/ui";
import { fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BatchReviewOptions, BatchReviewSummary } from "@/components/admin/batch-review";

const ACTION_TONE = { create: "brand", update: "warning", same: "neutral", error: "danger" } as const;
const FILTERS = ["all", "error", "warning", "create", "update", "same"] as const;
type Filter = (typeof FILTERS)[number];

const matches = (r: ImportRowView, f: Filter) =>
  f === "all" ? true : f === "warning" ? r.issues.some((i) => i.level === "warning") : r.action === f;

/** Một luồng cho tạo mới + cập nhật + nhập tồn: tải mẫu → chọn file → xem trước → xác nhận. */
export function CatalogImport({ canApprove = false }: { canApprove?: boolean }) {
  const t = useTranslations("CatalogImport");
  const [state, action, pending] = useActionState(catalogImportAction, undefined);
  const preview = state?.preview;
  return (
    <section className="space-y-4 rounded-xl border bg-card p-4">
      <div>
        <h2 className="font-medium">{t("title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("help")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a className={buttonVariants({ variant: "outline", size: "lg" })} href="/api/templates/catalog.xlsx"><Download aria-hidden />{t("templateBlank")}</a>
        <a className={buttonVariants({ variant: "outline", size: "lg" })} href="/api/templates/catalog-current.xlsx"><Download aria-hidden />{t("templateCurrent")}</a>
      </div>
      <p className="text-sm text-muted-foreground">
        {t("setupHint")} <Link className="text-primary underline" href="/admin/categories">{t("categories")}</Link> ·{" "}
        <Link className="text-primary underline" href="/admin/settings/warehouses">{t("warehouses")}</Link> ·{" "}
        <Link className="text-primary underline" href="/admin/selling-prices?mode=rates">{t("rates")}</Link>
      </p>
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="step" value="preview" />
        <FileField name="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" required aria-label={t("file")} className="max-w-72" />
        <Button type="submit" size="lg" disabled={pending}><Eye aria-hidden />{t("preview")}</Button>
      </form>
      {state?.error && <Notice tone="danger" className="whitespace-pre-line">{state.error}</Notice>}

      {preview && <ImportPreview preview={preview} action={action} pending={pending} canApprove={canApprove} />}

      {state?.result && (
        <Notice tone="success" className="space-y-2 p-4">
          <p>{t("success", { created: state.result.createdProducts, updated: state.result.updatedProducts })}</p>
          {state.result.documents.length > 0 && (
            <>
              <p data-testid="catalog-import-draft-note">{t("draftNote")}</p>
              <ul className="space-y-1">
                {state.result.documents.map((d) => (
                  <li key={d.id}>
                    <Link className="text-primary underline" href={`/admin/inventory/documents/${d.id}`}>{d.code} · {t("reviewDraft")}</Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          {state.review && <BatchReviewSummary review={state.review} />}
          <Link href="/admin/products" className="text-primary underline">{t("finishProducts")}</Link>
        </Notice>
      )}
    </section>
  );
}

function ImportPreview({ preview, action, pending, canApprove }: { preview: CatalogImportPreview; action: (formData: FormData) => void; pending: boolean; canApprove: boolean }) {
  const t = useTranslations("CatalogImport");
  const [filter, setFilter] = useState<Filter>("all");
  const rows = preview.rows.filter((r) => matches(r, filter));
  const blocked = preview.errors.length > 0;
  const withPrice = preview.rows.some((r) => r.price != null);
  const head = ["colLine", "colAction", "colProduct", "colLabel", "colSku", "colWeight", ...(withPrice ? ["colPrice"] : []), "colStock", "colNotes"];
  const counts = Object.fromEntries(FILTERS.map((f) => [f, preview.rows.filter((r) => matches(r, f)).length])) as Record<Filter, number>;
  const rc = preview.rowCounts;
  return (
    <div className="space-y-3" data-testid="catalog-import-preview">
      <div className="space-y-1 text-sm">
        <p className="font-medium" data-testid="catalog-import-summary">
          {t("summaryRows", { total: preview.rows.length, create: rc.create, update: rc.update, same: rc.same, error: rc.error })}
        </p>
        <p className="text-muted-foreground">
          {t("summaryProducts", { created: preview.counts.createdProducts, updated: preview.counts.updatedProducts, unchanged: preview.counts.unchangedProducts })}
          {preview.counts.stockLines > 0 && <> · {t("summaryStock", { stock: preview.counts.stockLines, documents: preview.documents })}</>}
        </p>
        {preview.counts.priceChanges > 0 && <p className="text-muted-foreground" data-testid="catalog-import-price-changes">{t("priceChanges", { count: preview.counts.priceChanges })}</p>}
        {preview.rate && <p className="text-muted-foreground">{t("rateQuote", { rate: preview.rate.vndPerMmk })}</p>}
      </div>

      {preview.general.length > 0 && (
        <Notice tone="danger" className="p-4">
          <ul className="list-disc space-y-1 pl-5">{preview.general.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </Notice>
      )}
      {preview.errors.length > preview.general.length && (
        <Notice tone="danger" className="p-4">
          <p className="font-medium">{t("errorsTitle")}</p>
          <details className="mt-1">
            <summary className="cursor-pointer">{t("issuesDetail", { count: preview.errors.length - preview.general.length })}</summary>
            <ul className="mt-1 list-disc space-y-1 pl-5">{preview.errors.filter((e) => !preview.general.includes(e)).map((e, i) => <li key={i} className="whitespace-pre-line">{e}</li>)}</ul>
          </details>
        </Notice>
      )}
      {preview.warnings.length > 0 && (
        <Notice tone="warning" className="p-4">
          <p className="font-medium">{t("warningsTitle")}</p>
          <details className="mt-1">
            <summary className="cursor-pointer">{t("issuesDetail", { count: preview.warnings.length })}</summary>
            <ul className="mt-1 list-disc space-y-1 pl-5">{preview.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </details>
        </Notice>
      )}

      <div className="flex flex-wrap gap-2" role="group" aria-label={t("filterLabel")}>
        {FILTERS.filter((f) => f === "all" || counts[f] > 0).map((f) => (
          <Button key={f} type="button" size="sm" variant={filter === f ? "secondary" : "ghost"} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {t(`filter.${f}`)} ({counts[f]})
          </Button>
        ))}
      </div>

      <DataTable numeric={[0]} head={head.map((k) => t(k))} empty={t("noRows")} tableClassName="min-w-[960px]">
        {rows.map((r) => <PreviewRow key={r.line} r={r} withPrice={withPrice} />)}
      </DataTable>

      <form action={action} className="space-y-2">
        <input type="hidden" name="step" value="confirm" />
        <input type="hidden" name="payload" value={JSON.stringify(preview.input)} />
        <BatchReviewOptions canApprove={canApprove} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" disabled={pending || blocked} aria-describedby="catalog-import-confirm-help"><Check aria-hidden />{t("confirm")}</Button>
          {blocked && rc.error > 0 && (
            <Button type="button" variant="link" onClick={() => setFilter("error")}>{t("showErrors")}</Button>
          )}
        </div>
        <p id="catalog-import-confirm-help" className="text-sm text-muted-foreground">
          {t(blocked ? "confirmBlocked" : "confirmHelp")}
        </p>
      </form>
    </div>
  );
}

function PreviewRow({ r, withPrice }: { r: ImportRowView; withPrice: boolean }) {
  const t = useTranslations("CatalogImport");
  const muted = "text-muted-foreground";
  const s = r.stock;
  return (
    <tr data-testid={`catalog-import-row-${r.line}`}>
      <Td numeric>{r.line}</Td>
      <Td>
        <Badge tone={ACTION_TONE[r.action]}>{t(`action.${r.action}`)}</Badge>
        {r.changes.length > 0 && (
          <div className={cn("mt-1 text-xs", muted)}>{t("changed", { fields: r.changes.map((c) => t(`field.${c}`)).join(", ") })}</div>
        )}
      </Td>
      <Td>
        <span className={cn(!r.nameFromFile && muted)}>{r.name || "—"}</span>
        {(r.brand || r.category) && <div className={cn("text-xs", muted)}>{[r.brand, r.category].filter(Boolean).join(" · ")}</div>}
      </Td>
      <Td><span className={cn(!r.labelFromFile && muted)}>{r.labelFromFile ? r.label : t("standardLabel")}</span></Td>
      <Td className="font-mono text-xs">
        {r.sku || "—"}
        {r.skuAuto && <div className={cn("font-sans", muted)}>{t("autoSku")}</div>}
      </Td>
      <Td className="whitespace-nowrap tabular-nums">
        {r.weight == null ? <span className={muted}>—</span> : <span className={cn(!r.weightFromFile && muted)}>{fmtInt(r.weight)}</span>}
      </Td>
      {withPrice && (
        <Td className="whitespace-nowrap tabular-nums">
          {r.price == null ? (
            <span className={muted}>{r.currentPrice == null ? "" : t("keep")}</span>
          ) : (
            <>
              {fmtInt(r.price)}
              {r.currentPrice != null && <div className={cn("text-xs", muted)}>{t("priceCurrent", { price: fmtInt(r.currentPrice) })}</div>}
              {r.priceStaged && r.currentPrice != null && r.price !== r.currentPrice && <div className="text-xs text-warning-foreground">{t("priceStaged")}</div>}
            </>
          )}
        </Td>
      )}
      <Td className="text-xs">
        {s && (
          <div className="space-y-0.5">
            <div className="text-sm">{t("stockQty", { qty: fmtInt(s.qty), location: s.location })}</div>
            <div className={muted}>{t("stockLot", { lot: s.lotNo })}{s.lotAuto && ` (${t("autoSku")})`}</div>
            <div className={s.expiryStatus === "UNKNOWN" ? "text-destructive" : muted}>
              {s.expiryDate ?? t(s.expiryStatus === "NONE" ? "expiryNone" : "expiryUnknown")}
            </div>
            <div>{t("purchase", { cost: fmtInt(s.unitCost), currency: s.currency })}</div>
            {s.currency === "VND" && (
              <div className={cn(s.inboundVnd == null && "text-warning-foreground")}>
                {s.inboundVnd == null ? t("inboundUnknown") : t("inbound", { fee: fmtInt(s.inboundVnd) })}
              </div>
            )}
            <div className={s.costMmk == null ? "text-warning-foreground" : muted}>
              {s.costMmk == null ? t("costMissing") : t("costMmk", { cost: fmtInt(s.costMmk) })}
            </div>
          </div>
        )}
      </Td>
      <Td className="text-xs">
        {r.issues.length > 0 && (
          <ul className="space-y-1">
            {r.issues.map((i, k) => (
              <li key={k} className={i.level === "error" ? "text-destructive" : "text-warning-foreground"}>{i.text}</li>
            ))}
          </ul>
        )}
      </Td>
    </tr>
  );
}
