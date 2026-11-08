"use client";

import Link from "next/link";
import { Eye, EyeOff, ArrowRightLeft, RotateCcw, Trash2 } from "lucide-react";
import { useActionState, useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Notice, fieldClass } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { productBulkAction, type ProductBulkState } from "@/server/catalog/actions";

export const BULK_FORM_ID = "product-bulk-publish";

/** Ô chọn SP trong danh sách (nằm ngoài form, gắn bằng thuộc tính `form`). */
export function BulkCheckbox({ id, label }: { id: string; label: string }) {
  return <input type="checkbox" name="ids" value={id} form={BULK_FORM_ID} aria-label={label} className="size-4 accent-primary" />;
}

function boxes() {
  return [...document.querySelectorAll<HTMLInputElement>(`input[name="ids"][form="${BULK_FORM_ID}"]`)];
}

/** Hỏi lại trước khi gửi; bấm Huỷ → không gửi form. */
const confirmOr = (text: string) => (e: MouseEvent) => {
  if (!window.confirm(text)) e.preventDefault();
};

/** Nút Xoá / Khôi phục ở từng dòng — gửi form chung với `intent = "delete:<id>"`. */
export function RowProductAction({ id, name, kind }: { id: string; name: string; kind: "delete" | "restore" }) {
  const t = useTranslations("Products");
  return (
    <Button
      type="submit"
      form={BULK_FORM_ID}
      name="intent"
      value={`${kind}:${id}`}
      size="icon-lg"
      variant={kind === "delete" ? "destructive" : "outline"}
      aria-label={`${t(kind === "delete" ? "delete" : "restore")} ${name}`}
      title={t(kind === "delete" ? "delete" : "restore")}
      onClick={kind === "delete" ? confirmOr(t("deleteOneConfirm", { name })) : undefined}
    >
      {kind === "delete" ? <Trash2 aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
    </Button>
  );
}

/** Thanh chọn tất cả + nút Hiện / Ẩn / Xoá (hoặc Khôi phục khi xem SP ngừng kinh doanh) cho các SP đã tick. */
export function BulkPublishBar({
  total,
  archivedView = false,
  warehouses = [],
}: {
  total: number;
  archivedView?: boolean;
  warehouses?: { id: string; name: string }[];
}) {
  const t = useTranslations("Products");
  const [selected, setSelected] = useState(0);
  const allRef = useRef<HTMLInputElement>(null);

  const recount = useCallback(() => {
    const list = boxes();
    const n = list.filter((b) => b.checked).length;
    setSelected(n);
    if (allRef.current) {
      allRef.current.checked = list.length > 0 && n === list.length;
      allRef.current.indeterminate = n > 0 && n < list.length;
    }
  }, []);

  const [state, action, pending] = useActionState(async (prev: ProductBulkState, formData: FormData) => {
    const result = await productBulkAction(prev, formData);
    // Xong → bỏ chọn để không bấm nhầm lần nữa.
    if (result?.done) {
      for (const b of boxes()) b.checked = false;
      recount();
    }
    return result;
  }, undefined);

  // Ô chọn từng dòng nằm ngoài component → nghe sự kiện change trên document.
  // Đếm lại một lần sau khi JS chạy: ô đã tick trước khi hydrate (mạng chậm) hoặc trình duyệt khôi phục khi quay lại trang.
  useEffect(() => {
    const onChange = (e: Event) => {
      if (e.target instanceof HTMLInputElement && e.target.getAttribute("form") === BULK_FORM_ID) recount();
    };
    document.addEventListener("change", onChange);
    const frame = requestAnimationFrame(recount);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("change", onChange);
    };
  }, [recount]);

  const done = state?.done;
  const none = pending || selected === 0;
  return (
    <form id={BULK_FORM_ID} action={action} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            ref={allRef}
            type="checkbox"
            className="size-4 accent-primary"
            disabled={total === 0}
            onChange={(e) => {
              for (const b of boxes()) b.checked = e.target.checked;
              recount();
            }}
          />
          {t("selectAll", { count: total })}
        </label>
        <span className="text-sm text-muted-foreground">{t("selectedCount", { count: selected })}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {archivedView ? (
            <Button type="submit" name="intent" value="restore" size="lg" disabled={none}>
              <RotateCcw aria-hidden className="size-4 shrink-0" />
              {t("bulkRestore")}
            </Button>
          ) : (
            <>
              <Button type="submit" name="intent" value="publish" size="lg" disabled={none}><Eye aria-hidden className="size-4 shrink-0" /> {t("bulkPublish")}</Button>
              <Button type="submit" name="intent" value="hide" size="lg" variant="outline" disabled={none}><EyeOff aria-hidden className="size-4 shrink-0" /> {t("bulkHide")}</Button>
              <Button type="submit" name="intent" value="delete" size="lg" variant="destructive" disabled={none} onClick={confirmOr(t("deleteConfirm", { count: selected }))} title={t("bulkDelete")} aria-label={t("bulkDelete")}><Trash2 aria-hidden className="size-4 shrink-0" /> {t("bulkDelete")}</Button>
              {warehouses.length > 1 && (
                <span className="flex items-center gap-1">
                  <select name="toLocationId" aria-label={t("moveTo")} defaultValue={warehouses[0].id} className={cn(fieldClass, "w-auto")}>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                  <Button type="submit" name="intent" value="move" size="lg" variant="outline" disabled={none} onClick={confirmOr(t("moveConfirm", { count: selected }))}>
                    <ArrowRightLeft aria-hidden className="size-4 shrink-0" />
                    {t("bulkMove")}
                  </Button>
                </span>
              )}
            </>
          )}
        </div>
      </div>
      {state?.error && <Notice tone="danger">{state.error}</Notice>}
      {done?.kind === "delete" && <Notice>{t("deleteDone", { deleted: done.deleted, archived: done.archived })}</Notice>}
      {done && done.kind !== "delete" && (
        <Notice>{t(done.kind === "restore" ? "restoreDone" : done.kind === "move" ? "moveDone" : "bulkDone", { count: done.count })}</Notice>
      )}
      {state?.blocked && state.blocked.length > 0 && (
        <div role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="publish-blocked">
          <p className="font-medium">{t("readiness.blockedBulk", { count: state.blocked.length })}</p>
          <ul className="mt-1 list-inside list-disc text-xs">
            {state.blocked.map((b) => (
              <li key={b.id}>
                <Link href={`/admin/products/${b.id}`} className="underline">
                  {b.name}
                </Link>
                : {b.reasons}
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
