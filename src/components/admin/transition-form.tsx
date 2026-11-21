"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Check, CheckCheck, PackageCheck, Truck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldClass, fieldLabelSmClass } from "@/components/admin/ui";
import { transitionOrderAction } from "@/server/orders/actions";
import { cn } from "@/lib/utils";
import { confirmOrPrevent } from "@/lib/confirm";

export type TransitionField = {
  name: "reason" | "carrier" | "trackingNo" | "fromLocationId" | "note";
  label: string;
  required?: boolean;
  defaultValue?: string;
  options?: { value: string; label: string }[];
};

const ICONS: Record<string, React.ReactNode> = {
  stockArrived: <PackageCheck aria-hidden />,
  confirmPayment: <Check aria-hidden />,
  confirmPrepayment: <Check aria-hidden />,
  stockArrivedPaid: <PackageCheck aria-hidden />,
  confirmCod: <Check aria-hidden />,
  ship: <Truck aria-hidden />,
  complete: <CheckCheck aria-hidden />,
  cancel: <X aria-hidden />,
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
      onSubmit={confirmOrPrevent(confirm)}
      className="flex flex-wrap items-end gap-2"
    >
      <input type="hidden" name="id" value={orderId} />
      <input type="hidden" name="transition" value={transition} />
      {fields.map((f) => (
        <label key={f.name} className={fieldLabelSmClass}>
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
        {ICONS[transition] ?? <ArrowRight aria-hidden />}
        {label}
      </Button>
      {state?.error && (
        <p role="alert" className="w-full text-sm text-destructive">
          {t("error")}: {state.error}
        </p>
      )}
      {/* Thông báo kèm khi thành công (vd bàn giao bằng lô giá vốn tạm); mã ngắn = tên thao tác thì không hiện. */}
      {state?.ok && !state.error && state.ok !== transition && (
        <p role="status" className="w-full text-sm text-warning" data-testid="transition-note">
          {state.ok}
        </p>
      )}
    </form>
  );
}
