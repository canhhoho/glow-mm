"use client";

import { useActionState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/server/inventory/actions";

/** Nút gửi một server action đơn giản (kèm hidden fields), hiện lỗi nếu có. */
export function ActionButton({
  action,
  fields,
  label,
  variant = "default",
  confirm,
  icon,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  label: string;
  variant?: "default" | "outline" | "destructive" | "ghost";
  confirm?: string;
  /** Render an icon button while retaining the accessible action label. */
  icon?: ReactNode;
}) {
  const t = useTranslations("Docs");
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className="inline-flex flex-col items-start gap-1"
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Button
        size={icon ? "icon-lg" : "lg"}
        type="submit"
        variant={variant}
        disabled={pending}
        aria-label={label}
        title={icon ? label : undefined}
        className={icon ? "size-11 md:size-9" : undefined}
      >
        {icon ?? label}
      </Button>
      {state?.error && (
        <p role="alert" className="max-w-md text-sm text-destructive">
          {t("error")}: {state.error}
        </p>
      )}
    </form>
  );
}
