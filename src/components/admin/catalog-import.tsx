"use client";

import { useActionState, useState } from "react";
import { Check, Download, Eye } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { catalogImportAction } from "@/server/catalog/actions";
import type { CatalogImportPreview, ImportChange, ImportIssue, ImportRowView } from "@/server/catalog/catalog-import";
import { Button, buttonVariants } from "@/components/ui/button";
import { FileField } from "@/components/admin/file-field";
import { Badge, DataTable, Notice, Td } from "@/components/admin/ui";
import { fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BatchReviewOptions, BatchReviewSummary } from "@/components/admin/batch-review";

const ACTION_TONE = { create: "brand", update: "warning", same: "neutral", error: "danger" } as const;
const FILTERS = ["all", "error", "warning", "create", "update", "same"] as const;
type Filter = (typeof FILTERS)[number];

/** Trang này chỉ nói về thông tin SP: lưu ý về lô nhập kho (hạn dùng, giá vốn) xem ở phiếu nhập nháp; lỗi thì luôn hiện. */
const shownIssues = (r: ImportRowView): ImportIssue[] => r.issues.filter((i) => i.level === "error" || !i.stock);

/**
 * Nhãn cột / trường đổi dùng chung `ProductFields` (cùng tên với form và tiêu đề Excel). Riêng mô tả, cách dùng
 * (gộp hai ngôn ngữ trong một thay đổi) dùng `CatalogImport.field.*`.
 */
type ProductFieldKey = "name" | "brand" | "category" | "ingredients" | "storage_note" | "pao_months" | "expiry_date" | "variant_label" | "sku" | "weight_g";
const CHANGE_FIELD: Record<Exclude<ImportChange, "description" | "usage">, ProductFieldKey> = {
  name: "name", brand: "brand", category: "category", ingredients: "ingredients", storage: "storage_note", pao: "pao_months", expiry: "expiry_date", label: "variant_label", weight: "weight_g",
};
function useChangeLabel() {
  const t = useTranslations("CatalogImport");
  const tf = useTranslations("ProductFields");
  return (c: ImportChange) => (c === "description" || c === "usage" ? t(`field.${c}`) : tf(`${CHANGE_FIELD[c]}.label`));
}
const matches = (r: ImportRowView, f: Filter) =>
  f === "all" ? true : f === "warning" ? shownIssues(r).some((i) => i.level === "warning") : r.action === f;

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
  const tf = useTranslations("ProductFields");
  const [filter, setFilter] = useState<Filter>("all");
  const rows = preview.rows.filter((r) => matches(r, filter));
  const blocked = preview.errors.length > 0;
  const head = [t("colLine"), t("colAction"), t("colProduct"), tf("variant_label.label"), tf("sku.label"), tf("weight_g.label"), t("colNotes")];
  const counts = Object.fromEntries(FILTERS.map((f) => [f, preview.rows.filter((r) => matches(r, f)).length])) as Record<Filter, number>;
  const rc = preview.rowCounts;
  return (
    <div className="space-y-3" data-testid="catalog-import-preview">
      <p className="text-sm font-medium" data-testid="catalog-import-summary">
        {t("summaryRows", { total: preview.rows.length, create: rc.create, update: rc.update, same: rc.same, error: rc.error })}
      </p>

      {preview.general.length > 0 && (
        <Notice tone="danger" className="p-4">
          <ul className="list-disc space-y-1 pl-5">{preview.general.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </Notice>
      )}

      {/* Bộ lọc chỉ hiện khi file có nhiều loại dòng. */}
      {FILTERS.filter((f) => f !== "all" && counts[f] > 0).length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("filterLabel")}>
          {FILTERS.filter((f) => f === "all" || counts[f] > 0).map((f) => (
            <Button key={f} type="button" size="sm" variant={filter === f ? "secondary" : "ghost"} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {t(`filter.${f}`)} ({counts[f]})
            </Button>
          ))}
        </div>
      )}

      {/* Điện thoại: mỗi dòng file một thẻ (nhãn từng ô); máy tính: bảng. Chỉ thông tin SP — nhập kho xem ở phiếu nháp. */}
      <DataTable stack numeric={[0]} head={head} empty={t("noRows")}>
        {rows.map((r) => <PreviewRow key={r.line} r={r} />)}
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

function PreviewRow({ r }: { r: ImportRowView }) {
  const t = useTranslations("CatalogImport");
  const tf = useTranslations("ProductFields");
  const changeLabel = useChangeLabel();
  const muted = "text-muted-foreground";
  const issues = shownIssues(r);
  return (
    <tr data-testid={`catalog-import-row-${r.line}`}>
      <Td label={t("colLine")} numeric>{r.line}</Td>
      <Td label={t("colAction")}>
        <Badge tone={ACTION_TONE[r.action]}>{t(`action.${r.action}`)}</Badge>
        {r.changes.length > 0 && (
          <div className={cn("mt-1 text-xs", muted)}>{t("changed", { fields: r.changes.map(changeLabel).join(", ") })}</div>
        )}
      </Td>
      <Td label={t("colProduct")}>
        <span className={cn(!r.nameFromFile && muted)}>{r.name || "—"}</span>
        {(r.brand || r.category) && <div className={cn("text-xs", muted)}>{[r.brand, r.category].filter(Boolean).join(" · ")}</div>}
      </Td>
      <Td label={tf("variant_label.label")}><span className={cn(!r.labelFromFile && muted)}>{r.labelFromFile ? r.label : t("standardLabel")}</span></Td>
      <Td label={tf("sku.label")} className="text-xs">
        <span className="font-mono">{r.sku || "—"}</span>
        {r.skuAuto && <span className={muted}> · {t("autoSku")}</span>}
      </Td>
      <Td label={tf("weight_g.label")} className="whitespace-nowrap tabular-nums">
        {r.weight == null ? <span className={muted}>—</span> : <span className={cn(!r.weightFromFile && muted)}>{fmtInt(r.weight)}</span>}
      </Td>
      <Td label={t("colNotes")} className={cn("text-xs", issues.length === 0 && "max-md:hidden")}>
        {issues.length > 0 && (
          <ul className="space-y-1">
            {issues.map((i, k) => (
              <li key={k} className={i.level === "error" ? "text-destructive" : "text-warning-foreground"}>{i.text}</li>
            ))}
          </ul>
        )}
      </Td>
    </tr>
  );
}
