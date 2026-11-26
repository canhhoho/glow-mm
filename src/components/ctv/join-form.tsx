"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2 } from "lucide-react";
import { submitApplicationAction } from "@/server/affiliates/portal-actions";
import { Button } from "@/components/ui/button";
import { FIELD } from "@/components/ui/field";
import { Field } from "@/components/ui/form-field";
import { Notice } from "@/components/ui/notice";

/** Form đăng ký làm CTV qua link mời. Gửi xong chỉ hiện thông báo chờ duyệt (chưa đăng nhập được). */
export function JoinForm({ invite, minPassword }: { invite: string; minPassword: number }) {
  const t = useTranslations("Ctv.join");
  const [state, action, pending] = useActionState(submitApplicationAction, undefined);

  if (state?.ok) {
    return (
      <div role="status" className="flex flex-col items-center gap-2 py-4 text-center" data-testid="join-sent">
        <CheckCircle2 className="size-10 text-brand-2" aria-hidden />
        <p className="font-medium">{t("sentTitle")}</p>
        <p className="text-sm text-muted-foreground">{t("sentBody")}</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="invite" value={invite} />
      {/* Ô bẫy bot: người thật không thấy, bot điền → bỏ qua đơn. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {(
        [
          ["name", "text", "name"],
          ["phone", "tel", "tel"],
          ["email", "email", "email"],
          ["password", "password", "new-password"],
          ["confirmPassword", "password", "new-password"],
        ] as const
      ).map(([name, type, autoComplete]) => (
        <Field key={name} label={t(name)} density="touch">
          <input
            id={`join-${name}`}
            name={name}
            type={type}
            required
            autoComplete={autoComplete}
            inputMode={type === "tel" ? "tel" : undefined}
            minLength={name.toLowerCase().includes("password") ? minPassword : undefined}
            maxLength={name === "email" ? 200 : 128}
            className={FIELD.touch}
          />
        </Field>
      ))}
      <p className="text-xs text-muted-foreground">{t("passwordHint", { min: minPassword })}</p>
      {state?.error && (
        <Notice tone="danger">{state.error}</Notice>
      )}
      <Button type="submit" size="touch" className="w-full" disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {t("submit")}
      </Button>
    </form>
  );
}
