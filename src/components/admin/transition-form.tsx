"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/admin/ui";
import { transitionOrderAction } from "@/server/orders/actions";
import { cn } from "@/lib/utils";

export type TransitionField = {
  name: "reason" | "carrier" | "trackingNo" | "fromLocationId" | "note";
  label: string;
  required?: boolean;
  defaultValue?: string;
  options?: { value: string; label: string }[];
};

/** Một thao tác chuyển trạng thái đơn, có thể kèm ô nhập (lý do huỷ, mã vận đơn, kho xuất…). */
export function TransitionForm({
  orderId,
  transition,
  label,
  fields = [],
  variant = "default",
  confirm,
}: {
  orderId: string;
  transition: string;
  label: string;
  fields?: TransitionField[];
  variant?: "default" | "outline" | "destructive";
  confirm?: string;
}) {
  const t = useTranslations("Orders");
  const [state, action, pending] = useActionState(transitionOrderAction, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className="flex flex-wrap items-end gap-2 rounded-lg border p-3"
    >
      <input type="hidden" name="id" value={orderId} />
      <input type="hidden" name="transition" value={transition} />
      {fields.map((f) => (
        <label key={f.name} className="grid content-start gap-1 text-xs">
          <span className="text-muted-foreground">{f.label}</span>
          {f.options ? (
            <select name={f.name} required={f.required} defaultValue={f.defaultValue} className={cn(fieldClass, "w-48")}>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input name={f.name} required={f.required} defaultValue={f.defaultValue} className={cn(fieldClass, "w-48")} />
          )}
        </label>
      ))}
      <Button size="lg" type="submit" variant={variant} disabled={pending}>
        {label}
      </Button>
      {state?.error && (
        <p role="alert" className="w-full text-sm text-destructive">
          {t("error")}: {state.error}
        </p>
      )}
    </form>
  );
}
