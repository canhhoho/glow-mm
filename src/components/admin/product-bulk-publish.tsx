"use client";

import Link from "next/link";
import { Eye, EyeOff, ArrowRightLeft, RotateCcw, Trash2 } from "lucide-react";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { MENU_ITEM, Notice, checkboxClass, fieldClass } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { confirmOrPrevent } from "@/lib/confirm";
import { productBulkAction, type ProductBulkState } from "@/server/catalog/actions";

export const BULK_FORM_ID = "product-bulk-publish";
const REVIEW_KINDS = new Set(["submit", "approve", "approvePublish", "reject"]);

/**
 * Ô chọn SP trong danh sách (nằm ngoài form, gắn bằng thuộc tính `form`). `version`: phiên bản duyệt đang hiển thị —
 * duyệt hàng loạt gửi kèm để SP đã đổi sau khi tải danh sách bị bỏ qua (không duyệt bản chưa xem).
 */
export function BulkCheckbox({ id, label, version }: { id: string; label: string; version?: number }) {
  return (
    <>
      <input type="checkbox" name="ids" value={id} form={BULK_FORM_ID} aria-label={label} className={checkboxClass} />
      {version !== undefined && <input type="hidden" name={`v:${id}`} value={version} form={BULK_FORM_ID} />}
    </>
  );
}

function boxes() {
  return [...document.querySelectorAll<HTMLInputElement>(`input[name="ids"][form="${BULK_FORM_ID}"]`)];
}

/** Nút Xoá / Khôi phục ở từng dòng — gửi form chung với `intent = "delete:<id>"`. */
export function RowProductAction({ id, name, kind, menu = false }: { id: string; name: string; kind: "delete" | "restore"; menu?: boolean }) {
  const t = useTranslations("Products");
  if (menu) {
    // Dòng trong menu ⋯ của danh sách (P3): chữ thay cho nút icon.
    return (
      <button
        type="submit"
        form={BULK_FORM_ID}
        name="intent"
        value={`${kind}:${id}`}
        aria-label={`${t(kind === "delete" ? "delete" : "restore")} ${name}`}
        className={cn(MENU_ITEM, kind === "delete" && "text-destructive")}
        onClick={kind === "delete" ? confirmOrPrevent(t("deleteOneConfirm", { name })) : undefined}
      >
        {t(kind === "delete" ? "delete" : "restore")}
      </button>
    );
  }
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
      onClick={kind === "delete" ? confirmOrPrevent(t("deleteOneConfirm", { name })) : undefined}
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
  can = { publish: true, approve: false },
  reviewQueue = false,
}: {
  total: number;
  archivedView?: boolean;
  warehouses?: { id: string; name: string }[];
  /** Quyền của người xem: đăng/ẩn, duyệt (nút ẩn hẳn khi không có quyền; server vẫn kiểm). */
  can?: { publish: boolean; approve: boolean };
  /** Đang lọc "Chờ duyệt": hiện Duyệt & Đăng / Duyệt / Từ chối. */
  reviewQueue?: boolean;
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
              {reviewQueue && can.approve ? (
                <span className="flex flex-wrap items-center gap-2" data-testid="bulk-review">
                  {can.publish && (
                    <Button type="submit" name="intent" value="approvePublish" size="lg" disabled={none} onClick={confirmOrPrevent(t("bulkReview.approveConfirm", { count: selected }))}>
                      {t("bulkReview.approvePublish")}
                    </Button>
                  )}
                  <Button type="submit" name="intent" value="approve" size="lg" variant="outline" disabled={none} onClick={confirmOrPrevent(t("bulkReview.approveConfirm", { count: selected }))}>
                    {t("bulkReview.approve")}
                  </Button>
                  <input name="reason" aria-label={t("review.rejectReason")} placeholder={t("review.rejectReason")} maxLength={500} className={cn(fieldClass, "w-48")} />
                  <Button type="submit" name="intent" value="reject" size="lg" variant="outline" disabled={none}>
                    {t("review.reject")}
                  </Button>
                </span>
              ) : (
                <Button type="submit" name="intent" value="submit" size="lg" disabled={none}>{t("review.submit")}</Button>
              )}
              {can.publish && (
                <>
                  <Button type="submit" name="intent" value="publish" size="lg" variant="outline" disabled={none}><Eye aria-hidden className="size-4 shrink-0" /> {t("bulkPublish")}</Button>
                  <Button type="submit" name="intent" value="hide" size="lg" variant="outline" disabled={none}><EyeOff aria-hidden className="size-4 shrink-0" /> {t("bulkHide")}</Button>
                </>
              )}
              <Button type="submit" name="intent" value="delete" size="lg" variant="destructive" disabled={none} onClick={confirmOrPrevent(t("deleteConfirm", { count: selected }))} title={t("bulkDelete")} aria-label={t("bulkDelete")}><Trash2 aria-hidden className="size-4 shrink-0" /> {t("bulkDelete")}</Button>
              {warehouses.length > 1 && (
                <span className="flex items-center gap-1">
                  <select name="toLocationId" aria-label={t("moveTo")} defaultValue={warehouses[0].id} className={cn(fieldClass, "w-auto")}>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                  <Button type="submit" name="intent" value="move" size="lg" variant="outline" disabled={none} onClick={confirmOrPrevent(t("moveConfirm", { count: selected }))}>
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
      {done?.kind === "delete" && <Notice tone="success">{t("deleteDone", { deleted: done.deleted, archived: done.archived })}</Notice>}
      {done && done.kind !== "delete" && (
        <Notice tone="success" data-testid="bulk-done">
          {REVIEW_KINDS.has(done.kind)
            ? t(`bulkReview.done.${done.kind}`, { count: done.count })
            : t(done.kind === "restore" ? "restoreDone" : done.kind === "move" ? "moveDone" : "bulkDone", { count: done.count })}
        </Notice>
      )}
      {state?.blocked && state.blocked.length > 0 && (
        <Notice tone="danger" data-testid="publish-blocked">
          <p className="font-medium">
            {done && REVIEW_KINDS.has(done.kind) ? t("bulkReview.failed", { count: state.blocked.length }) : t("readiness.blockedBulk", { count: state.blocked.length })}
          </p>
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
        </Notice>
      )}
    </form>
  );
}
