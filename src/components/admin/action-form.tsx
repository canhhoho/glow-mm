"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/server/inventory/actions";

/**
 * Form gửi server action với các ô nhập render sẵn (children, có thể là Server Component).
 * Hiện lỗi / thông báo thành công; `okText` dùng khi action trả `ok` là mã ngắn.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  okText,
  className,
  variant = "default",
  confirm,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  submitLabel: string;
  okText?: string;
  className?: string;
  variant?: "default" | "outline" | "destructive";
  confirm?: string;
}) {
  const t = useTranslations("Docs");
  const [state, formAction, pending] = useActionState(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  // `action={…}` làm React reset form sau MỌI lần gửi → lỗi thì mất số vừa nhập. Gửi qua onSubmit và
  // chỉ reset khi thành công (ô nhập về defaultValue mới sau revalidate, form tạo mới được xoá trắng).
  useEffect(() => {
    if (state?.ok && !state.error) formRef.current?.reset();
  }, [state]);
  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => formAction(fd));
      }}
      className={className ?? "space-y-3"}
    >
      {children}
      {/* self-end: form dạng lưới/flex → nút nằm đáy ô, thẳng hàng với ô nhập cùng hàng (nút cao bằng ô: size lg). */}
      <div className="flex flex-wrap items-center gap-3 self-end">
        <Button size="lg" type="submit" variant={variant} disabled={pending}>
          {submitLabel}
        </Button>
        {state?.ok && !state.error && (
          <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
            {okText ?? state.ok}
          </p>
        )}
      </div>
      {state?.error && (
        <p role="alert" className="col-span-full max-w-2xl text-sm text-destructive">
          {t("error")}: {state.error}
        </p>
      )}
    </form>
  );
}
