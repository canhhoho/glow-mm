"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { trackOrderAction } from "@/server/cart/actions";
import { Notice, primaryButton, storeField, storeLabel } from "./ui";
import { SubmitButton } from "@/components/ui/submit-button";

export function TrackForm({ locale, code }: { locale: string; code?: string }) {
  const t = useTranslations("Track");
  const [state, action, pending] = useActionState(trackOrderAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="locale" value={locale} />
      <label className={storeLabel}>
        <span>{t("code")}</span>
        <input name="code" required defaultValue={code} autoCapitalize="characters" className={`${storeField} font-mono`} />
      </label>
      <label className={storeLabel}>
        <span>{t("phone")}</span>
        <input name="phone" required type="tel" inputMode="tel" autoComplete="tel" className={storeField} />
      </label>
      {state?.error && <Notice tone="danger">{state.error}</Notice>}
      <SubmitButton pending={pending} className={`${primaryButton} w-full`}>
        {t("submit")}
      </SubmitButton>
    </form>
  );
}
