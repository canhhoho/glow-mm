"use client";

import { useActionState } from "react";
import { Check, Eye } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { catalogImportAction } from "@/server/catalog/actions";
import { Button } from "@/components/ui/button";
import { FileField } from "@/components/admin/file-field";
import { Badge, DataTable, Notice, Td } from "@/components/admin/ui";
import { fmtInt } from "@/lib/format";

const ACTION_TONE = { create: "brand", update: "warning", same: "neutral" } as const;

/** Một luồng cho tạo mới + cập nhật + nhập tồn: tải mẫu → chọn file → xem trước → xác nhận. */
export function CatalogImport() {
  const t = useTranslations("CatalogImport");
  const [state, action, pending] = useActionState(catalogImportAction, undefined);
  const preview = state?.preview;
  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div>
        <h2 className="font-medium">{t("title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("help")}</p>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <a className="text-primary underline" href="/api/templates/catalog.xlsx">{t("templateBlank")}</a>
        <a className="text-primary underline" href="/api/templates/catalog-current.xlsx">{t("templateCurrent")}</a>
      </div>
      <p className="text-sm text-muted-foreground">
        {t("setupHint")} <Link className="text-primary underline" href="/admin/categories">{t("categories")}</Link> ·{" "}
        <Link className="text-primary underline" href="/admin/settings/warehouses">{t("warehouses")}</Link> ·{" "}
        <Link className="text-primary underline" href="/admin/pricing">{t("rates")}</Link>
      </p>
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="step" value="preview" />
        <FileField name="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" required aria-label={t("file")} className="max-w-72" />
        <Button type="submit" size="lg" disabled={pending}><Eye aria-hidden />{t("preview")}</Button>
      </form>
      {state?.error && <p role="alert" className="text-sm whitespace-pre-line text-destructive">{state.error}</p>}

      {preview && (
        <div className="space-y-3" data-testid="catalog-import-preview">
          <p className="text-sm font-medium">
            {t("summary", { created: preview.counts.createdProducts, updated: preview.counts.updatedProducts, unchanged: preview.counts.unchangedProducts, stock: preview.counts.stockLines })}
          </p>
          {preview.rate && <p className="text-sm text-muted-foreground">{t("rateQuote", { rate: preview.rate })}</p>}
          {preview.errors.length > 0 && (
            <Notice tone="danger" className="p-4">
              <p className="font-medium">{t("errorsTitle")}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">{preview.errors.map((e, i) => <li key={i} className="whitespace-pre-line">{e}</li>)}</ul>
            </Notice>
          )}
          {preview.warnings.length > 0 && (
            <div className="rounded-lg bg-muted p-4 text-sm">
              <p className="font-medium">{t("warningsTitle")}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">{preview.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}
          <DataTable head={["colLine", "colAction", "colProduct", "colSku", "colPrice", "colStock", "colCost"].map((k) => t(k))}>
            {preview.rows.map((r, i) => (
              <tr key={i}>
                <Td className="tabular-nums">{r.line}</Td>
                <Td><Badge tone={ACTION_TONE[r.action]}>{t(`action.${r.action}`)}</Badge></Td>
                <Td>{r.name}<div className="text-xs text-muted-foreground">{r.label}</div></Td>
                <Td className="font-mono text-xs">{r.sku}</Td>
                <Td className="whitespace-nowrap tabular-nums">
                  {r.oldPrice != null && r.oldPrice !== r.price && <span className="text-muted-foreground line-through">{fmtInt(r.oldPrice)}</span>} {fmtInt(r.price)}
                </Td>
                <Td>
                  {r.stock && (
                    <>
                      {fmtInt(r.stock.qty)} · {r.stock.lotNo} · {r.stock.location}
                      <div className={`text-xs ${r.stock.expiryStatus === "UNKNOWN" ? "text-destructive" : "text-muted-foreground"}`}>
                        {r.stock.expiryDate ?? t(r.stock.expiryStatus === "NONE" ? "expiryNone" : "expiryUnknown")}
                      </div>
                    </>
                  )}
                </Td>
                <Td className="tabular-nums">{r.stock ? fmtInt(r.stock.costMmk) : ""}</Td>
              </tr>
            ))}
          </DataTable>
          <p className="text-sm text-muted-foreground">{t("confirmHelp")}</p>
          {preview.errors.length === 0 && (
            <form action={action}>
              <input type="hidden" name="step" value="confirm" />
              <input type="hidden" name="payload" value={JSON.stringify(preview.input)} />
              <Button type="submit" size="lg" disabled={pending}><Check aria-hidden />{t("confirm")}</Button>
            </form>
          )}
        </div>
      )}

      {state?.result && (
        <div role="status" className="space-y-2 rounded-lg bg-muted p-4 text-sm">
          <p>{t("success", { created: state.result.createdProducts, updated: state.result.updatedProducts })}</p>
          {state.result.documents.length > 0 && (
            <ul className="space-y-1">
              {state.result.documents.map((d) => (
                <li key={d.id}>
                  <Link className="text-primary underline" href={`/admin/inventory/documents/${d.id}`}>{d.code} · {t("reviewDraft")}</Link>
                </li>
              ))}
            </ul>
          )}
          <Link href="/admin/products" className="text-primary underline">{t("finishProducts")}</Link>
        </div>
      )}
    </section>
  );
}
