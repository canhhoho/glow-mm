"use client";

import { ListChecks, Printer, ClipboardList, Check, Truck, CheckCheck } from "lucide-react";
import { startTransition, useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { askConfirm } from "@/lib/confirm";
import { bulkTransitionAction } from "@/server/orders/actions";
import type { BulkState, BulkTransition } from "@/server/orders/bulk";
import { fieldClass } from "./ui";
import { cn } from "@/lib/utils";

const SELECTOR = "input[data-bulk-id]";
// Next Activity giữ DOM trang cũ: ô đang ẩn không thuộc phạm vi thao tác của trang hiện tại.
const boxes = () => [...document.querySelectorAll<HTMLInputElement>(SELECTOR)].filter(b => b.getClientRects().length > 0);
const checkedIds = () => boxes().filter((b) => b.checked).map((b) => b.dataset.bulkId!);

/**
 * DT: thanh thao tác hàng loạt trên danh sách đơn. Ô chọn nằm trong từng dòng (render ở server, `data-bulk-id`);
 * thanh này đọc ô đã chọn khi bấm. Mỗi đơn vẫn được kiểm trạng thái/quyền/tồn ở server và báo kết quả riêng.
 */
export function BulkOrderBar({ transitions }: { transitions: BulkTransition[] }) {
  const t = useTranslations("Orders");
  const [count, setCount] = useState(0);
  const [carrier, setCarrier] = useState("VTP");
  // Xử lý xong → bỏ chọn (danh sách được tải lại với trạng thái mới).
  const [state, action, pending] = useActionState(async (prev: BulkState, fd: FormData) => {
    const result = await bulkTransitionAction(prev, fd);
    if (result && !result.error) {
      for (const b of boxes()) b.checked = false;
      setCount(0);
    }
    return result;
  }, undefined);

  useEffect(() => {
    const onChange = (e: Event) => {
      if (e.target instanceof HTMLInputElement && e.target.matches(SELECTOR)) setCount(checkedIds().length);
    };
    document.addEventListener("change", onChange);
    return () => document.removeEventListener("change", onChange);
  }, []);
  const toggleAll = () => {
    const all = boxes();
    const next = !all.every((b) => b.checked);
    for (const b of all) b.checked = next;
    setCount(next ? all.length : 0);
  };
  const run = (transition: BulkTransition) => {
    const ids = checkedIds();
    if (ids.length === 0) return;
    if (!askConfirm(t(`bulk.confirm.${transition}`, { count: ids.length }))) return;
    const fd = new FormData();
    fd.set("transition", transition);
    if (transition === "ship") fd.set("carrier", carrier);
    for (const id of ids) fd.append("ids", id);
    startTransition(() => action(fd));
  };
  const print = (path: "print-labels" | "pick-list") => {
    const ids = checkedIds();
    if (ids.length > 0) window.open(`/admin/orders/${path}?ids=${ids.join(",")}`, "_blank");
  };
  const none = count === 0 || pending;

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3" data-testid="bulk-bar">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="lg" onClick={toggleAll}>
          <ListChecks aria-hidden className="size-4 shrink-0" />
          {t("bulk.toggleAll")}
        </Button>
        <span className="text-sm tabular-nums" role="status" data-testid="bulk-count">
          {t("bulk.selected", { count })}
        </span>
        <span className="mx-1 hidden h-6 border-l sm:inline-block" />
        <Button type="button" variant="outline" size="lg" disabled={count === 0} onClick={() => print("print-labels")}>
          <Printer aria-hidden className="size-4 shrink-0" />
          {t("bulk.printLabels")}
        </Button>
        <Button type="button" variant="outline" size="lg" disabled={count === 0} onClick={() => print("pick-list")}>
          <ClipboardList aria-hidden className="size-4 shrink-0" />
          {t("bulk.printPick")}
        </Button>
        {transitions.includes("confirmCod") && (
          <Button type="button" size="lg" disabled={none} onClick={() => run("confirmCod")}>
            <Check aria-hidden className="size-4 shrink-0" />
            {t("bulk.confirmCod")}
          </Button>
        )}
        {transitions.includes("ship") && (
          <span className="flex items-center gap-1">
            <input
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              aria-label={t("bulk.carrier")}
              maxLength={100}
              className={cn(fieldClass, "w-24")}
            />
            <Button type="button" size="lg" disabled={none || !carrier.trim()} onClick={() => run("ship")}>
              <Truck aria-hidden className="size-4 shrink-0" />
              {t("bulk.ship")}
            </Button>
          </span>
        )}
        {transitions.includes("complete") && (
          <Button type="button" size="lg" disabled={none} onClick={() => run("complete")}>
            <CheckCheck aria-hidden className="size-4 shrink-0" />
            {t("bulk.complete")}
          </Button>
        )}
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state && !state.error && (
        <div role="status" className="space-y-1 text-sm" data-testid="bulk-result">
          <p className={state.failed?.length ? "text-warning" : "text-success"}>
            {t("bulk.result", { done: state.done ?? 0, total: state.total ?? 0 })}
          </p>
          {state.failed && state.failed.length > 0 && (
            <ul className="list-inside list-disc text-xs text-destructive">
              {state.failed.map((f) => (
                <li key={f.code}>
                  <span className="font-mono">{f.code}</span>: {f.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
