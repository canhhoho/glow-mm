"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Loader2, Save } from "lucide-react";
import type { ActionState } from "@/server/inventory/actions";
import { askConfirm } from "@/lib/confirm";
import { cn } from "@/lib/utils";
import { CopyButton } from "@/components/ctv/copy-button";
import type { Density } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";

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
  icon = <Save aria-hidden />,
  density = "compact",
  id,
  actionsClassName,
  secret,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  submitLabel: string;
  okText?: string;
  className?: string;
  variant?: "default" | "outline" | "destructive";
  confirm?: string;
  icon?: React.ReactNode;
  /** `touch`: nút cao h-11 (cổng CTV / storefront). */
  density?: Density;
  /** Để ô nhập nằm ngoài form gắn vào bằng thuộc tính `form`. */
  id?: string;
  /** Lớp thêm cho nhóm nút Lưu (vd `ml-auto` để đẩy nút về phải trên thanh thao tác). */
  actionsClassName?: string;
  /**
   * Action trả `ok` là chuỗi bí mật hiện một lần (vd token agent): hiện trong ô chỉ đọc một dòng (bấm vào = chọn hết) + nút
   * Sao chép, thay vì đoạn chữ tự xuống dòng dễ chép sót (25/11/2026).
   */
  secret?: { label: string; copy: string; copied: string };
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
      id={id}
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        if (!askConfirm(confirm)) return;
        const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => formAction(fd));
      }}
      className={className ?? "space-y-3"}
    >
      {children}
      {/* self-end: form dạng lưới/flex → nút nằm đáy ô, thẳng hàng với ô nhập cùng hàng (nút cao bằng ô: size lg). */}
      <div className={cn("flex flex-wrap items-center gap-3 self-end", actionsClassName)}>
        <Button size={density === "touch" ? "touch" : "lg"} type="submit" variant={variant} disabled={pending} aria-busy={pending || undefined}>
          {pending ? <Loader2 aria-hidden className="animate-spin" /> : icon}
          {submitLabel}
        </Button>
        {state?.ok && !state.error && !secret && (
          <FormMessage tone="success">
            {okText ?? state.ok}
          </FormMessage>
        )}
      </div>
      {secret && state?.ok && !state.error && (
        <div role="status" className="col-span-full basis-full min-w-0 space-y-2 rounded-md border border-success/40 bg-success/5 p-3">
          <p className="text-sm text-success">{secret.label}</p>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <input
              readOnly
              value={state.ok}
              data-testid="action-secret"
              aria-label={secret.label}
              onFocus={(e) => e.currentTarget.select()}
              spellCheck={false}
              className="h-10 min-w-0 flex-1 basis-64 rounded-md border bg-background px-3 font-mono text-sm"
            />
            <CopyButton text={state.ok} label={secret.copy} done={secret.copied} />
          </div>
        </div>
      )}
      {state?.error && (
        <FormMessage className="col-span-full basis-full max-w-2xl">
          {t("error")}: {state.error}
        </FormMessage>
      )}
    </form>
  );
}
