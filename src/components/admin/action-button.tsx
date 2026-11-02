"use client";

import { useActionState } from "react";
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
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  label: string;
  variant?: "default" | "outline" | "destructive";
  confirm?: string;
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
      <Button size="lg" type="submit" variant={variant} disabled={pending}>
        {label}
      </Button>
      {state?.error && (
        <p role="alert" className="max-w-md text-sm text-destructive">
          {t("error")}: {state.error}
        </p>
      )}
    </form>
  );
}
