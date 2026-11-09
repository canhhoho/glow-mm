"use client";

import { useActionState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/server/inventory/actions";
import { confirmOrPrevent } from "@/lib/confirm";

/** Nút gửi một server action đơn giản (kèm hidden fields), hiện lỗi nếu có. */
export function ActionButton({
  action,
  fields,
  label,
  variant = "default",
  confirm,
  icon,
  iconOnly = true,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  label: string;
  variant?: "default" | "outline" | "destructive" | "ghost";
  confirm?: string;
  /** Render an icon button while retaining the accessible action label. */
  icon?: ReactNode;
  /** Detail actions retain their label; row actions show only their icon. */
  iconOnly?: boolean;
}) {
  const t = useTranslations("Docs");
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form
      action={formAction}
      onSubmit={confirmOrPrevent(confirm)}
      className="inline-flex flex-col items-start gap-1"
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Button
        size={icon && iconOnly ? "icon-lg" : "lg"}
        type="submit"
        variant={variant}
        disabled={pending}
        aria-label={label}
        title={icon ? label : undefined}
      >
        {icon}
        {icon && iconOnly ? <span className="sr-only">{label}</span> : label}
      </Button>
      {state?.error && (
        <p role="alert" className="max-w-md text-sm text-destructive">
          {t("error")}: {state.error}
        </p>
      )}
    </form>
  );
}
