"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/admin/ui";
import { setProductsPublishedAction } from "@/server/catalog/actions";
import type { ActionState } from "@/server/inventory/actions";

export const BULK_FORM_ID = "product-bulk-publish";

/** Ô chọn SP trong danh sách (nằm ngoài form, gắn bằng thuộc tính `form`). */
export function BulkCheckbox({ id, label }: { id: string; label: string }) {
  return <input type="checkbox" name="ids" value={id} form={BULK_FORM_ID} aria-label={label} className="size-4 accent-primary" />;
}

function boxes() {
  return [...document.querySelectorAll<HTMLInputElement>(`input[name="ids"][form="${BULK_FORM_ID}"]`)];
}

/** Thanh chọn tất cả + nút "Hiện trên web" / "Ẩn" cho các SP đã tick. */
export function BulkPublishBar({ total }: { total: number }) {
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

  const [state, action, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await setProductsPublishedAction(prev, formData);
    // Lưu xong → bỏ chọn để không bấm nhầm lần nữa.
    if (result?.ok) {
      for (const b of boxes()) b.checked = false;
      recount();
    }
    return result;
  }, undefined);

  // Ô chọn từng dòng nằm ngoài component → nghe sự kiện change trên document.
  useEffect(() => {
    const onChange = (e: Event) => {
      if (e.target instanceof HTMLInputElement && e.target.getAttribute("form") === BULK_FORM_ID) recount();
    };
    document.addEventListener("change", onChange);
    return () => document.removeEventListener("change", onChange);
  }, [recount]);

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
          <Button type="submit" name="published" value="1" size="lg" disabled={pending || selected === 0}>
            {t("bulkPublish")}
          </Button>
          <Button type="submit" name="published" value="0" size="lg" variant="outline" disabled={pending || selected === 0}>
            {t("bulkHide")}
          </Button>
        </div>
      </div>
      {state?.error && <Notice tone="danger">{state.error}</Notice>}
      {state?.ok && <Notice>{t("bulkDone", { count: Number(state.ok) })}</Notice>}
    </form>
  );
}
