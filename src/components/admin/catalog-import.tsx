"use client";

import { startTransition, useActionState, useState } from "react";
import { Check, Download, Eye } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { catalogImportAction, type CatalogImportState } from "@/server/catalog/actions";
import type { CatalogImportPreview, ImportChange, ImportRowView } from "@/server/catalog/catalog-import";
import { Button, buttonVariants } from "@/components/ui/button";
import { FileField } from "@/components/admin/file-field";
import { Badge, DataTable, Field, fieldClass, Notice, Td } from "@/components/admin/ui";
import { fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MAX_CATALOG_FILE_BYTES, visibleXlsxSheets } from "@/lib/xlsx-sheets";
import { BatchReviewOptions, BatchReviewSummary } from "@/components/admin/batch-review";
import { FormMessage } from "@/components/ui/form-message";

const ACTION_TONE = { create: "brand", update: "warning", same: "neutral", error: "danger" } as const;
const FILTERS = ["all", "error", "warning", "create", "update", "same"] as const;
type Filter = (typeof FILTERS)[number];
type WorkbookChoice =
  | { file: File; status: "loading" }
  | { file: File; status: "ready"; sheets: string[]; selected: string }
  | { file: File; status: "error"; message: "sheetReadError" | "fileTooLarge" };


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
  f === "all" ? true : f === "warning" ? r.issues.some((i) => i.level === "warning") : r.action === f;

/** Một luồng cho tạo mới + cập nhật + nhập tồn: tải mẫu → chọn file → xem trước → xác nhận. */
export function CatalogImport({ canApprove = false }: { canApprove?: boolean }) {
  const t = useTranslations("CatalogImport");
  const [actionState, action, pending] = useActionState(catalogImportAction, undefined);
  const [ignoredState, setIgnoredState] = useState<CatalogImportState>();
  const [workbook, setWorkbook] = useState<WorkbookChoice>();
  const state = actionState === ignoredState ? undefined : actionState;
  const preview = state?.preview;
  const canPreview = !pending && (!workbook || (workbook.status === "ready" && Boolean(workbook.selected)));

  async function chooseFile(file: File | undefined) {
    setIgnoredState(actionState);
    if (!file || !/\.xlsx$/i.test(file.name)) {
      setWorkbook(undefined);
      return;
    }
    if (file.size > MAX_CATALOG_FILE_BYTES) {
      setWorkbook({ file, status: "error", message: "fileTooLarge" });
      return;
    }
    setWorkbook({ file, status: "loading" });
    const finish = (next: WorkbookChoice) => setWorkbook((current) => current?.file === file ? next : current);
    try {
      const sheets = await visibleXlsxSheets(file);
      if (sheets.length === 0) throw new Error("No visible sheets");
      finish({ file, status: "ready", sheets, selected: sheets.length === 1 ? sheets[0] : "" });
    } catch {
      finish({ file, status: "error", message: "sheetReadError" });
    }
  }

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
      <form action={action} onSubmit={(event) => {
        event.preventDefault();
        if (!canPreview) return;
        const formData = new FormData(event.currentTarget);
        // Gửi thủ công để giữ ô file khi đổi sheet hoặc xem trước lại.
        startTransition(() => action(formData));
      }}>
        <input type="hidden" name="step" value="preview" />
        <fieldset disabled={pending} className="flex min-w-0 flex-wrap items-end gap-3">
          <FileField name="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" required aria-label={t("file")} className="max-w-72" onChange={(event) => void chooseFile(event.currentTarget.files?.[0])} />
          {workbook?.status === "ready" && (workbook.sheets.length === 1 ? (
            <input type="hidden" name="sheet" value={workbook.selected} />
          ) : (
            <Field label={t("sheetLabel")} className="w-full min-w-0 sm:w-auto">
              <select name="sheet" required className={cn(fieldClass, "w-full sm:max-w-72")} value={workbook.selected} onChange={(event) => {
                setIgnoredState(actionState);
                setWorkbook({ ...workbook, selected: event.currentTarget.value });
              }}>
                <option value="" disabled>{t("chooseSheet")}</option>
                {workbook.sheets.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </Field>
          ))}
          <Button type="submit" size="lg" disabled={!canPreview}><Eye aria-hidden />{t("preview")}</Button>
        </fieldset>
      </form>
      {workbook?.status === "loading" && <FormMessage tone="muted">{t("readingSheets")}</FormMessage>}
      {workbook?.status === "error" && <Notice tone="danger">{t(workbook.message)}</Notice>}
      {state?.error && <Notice tone="danger" className="whitespace-pre-line">{state.error}</Notice>}

      {preview && <ImportPreview preview={preview} sheetName={state.sheetName} action={action} pending={pending} canApprove={canApprove} />}

      {state?.result && (
        <Notice tone="success" className="space-y-2 p-4">
          <p>{t("success", { created: state.result.createdProducts, updated: state.result.updatedProducts })}</p>
          {/* 19/11/2026: Excel không tạo phiếu — SL dự kiến nhập + giá mua được gợi ý sẵn khi tạo phiếu nhập. */}
          {state.result.plannedQty > 0 && (
            <p data-testid="catalog-import-planned-note">
              {t("plannedNote", { n: state.result.plannedQty })}{" "}
              <Link className="text-primary underline" href="/admin/inventory/documents/new?type=RECEIVE">{t("createReceipt")}</Link>
            </p>
          )}
          {state.review && <BatchReviewSummary review={state.review} />}
          <Link href="/admin/products" className="text-primary underline">{t("finishProducts")}</Link>
        </Notice>
      )}
    </section>
  );
}

function ImportPreview({ preview, sheetName, action, pending, canApprove }: { preview: CatalogImportPreview; sheetName?: string; action: (formData: FormData) => void; pending: boolean; canApprove: boolean }) {
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
      {sheetName && <p className="text-sm text-muted-foreground break-words">{t("previewingSheet", { sheet: sheetName })}</p>}
      <p className="text-sm font-medium" data-testid="catalog-import-summary">
        {t("summaryRows", { total: preview.rows.length, create: rc.create, update: rc.update, same: rc.same, error: rc.error })}
      </p>
      {/* 19/11/2026: Excel chỉ ghi hồ sơ SP + SL dự kiến nhập + giá mua hiện tại — không tạo phiếu, không đổi tồn. */}
      {(preview.counts.plannedQty > 0 || preview.counts.purchasePrices > 0) && (
        <p className="text-sm text-muted-foreground" data-testid="catalog-import-stock-summary">
          {t("summaryPlanned", { planned: preview.counts.plannedQty, purchase: preview.counts.purchasePrices })}
        </p>
      )}

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
  const issues = r.issues;
  return (
    <tr data-testid={`catalog-import-row-${r.line}`}>
      <Td label={t("colLine")} numeric>{r.line}</Td>
      <Td label={t("colAction")}>
        <Badge tone={ACTION_TONE[r.action]}>{t(`action.${r.action}`)}</Badge>
        {r.changes.length > 0 && (
          <div className={cn("mt-1 text-xs", muted)}>{t("changed", { fields: r.changes.map(changeLabel).join(", ") })}</div>
        )}
        {r.action !== "error" && (
          <div className={cn("mt-1 text-xs", muted)} data-testid="catalog-import-row-kind">
            {[
              r.purchase ? t("rowPurchase", { amount: fmtInt(r.purchase.amount), currency: r.purchase.currency, location: r.purchase.location }) : r.planned != null ? t("rowProfileBase") : t("rowProfile"),
              r.planned != null && t("rowPlanned", { qty: fmtInt(r.planned) }),
            ].filter(Boolean).join(" · ")}
          </div>
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
