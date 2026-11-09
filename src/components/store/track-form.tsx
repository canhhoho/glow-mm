"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { trackOrderAction } from "@/server/cart/actions";
import { Notice, primaryButton, storeField } from "./ui";

export function TrackForm({ locale, code }: { locale: string; code?: string }) {
  const t = useTranslations("Track");
  const [state, action, pending] = useActionState(trackOrderAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="locale" value={locale} />
      <label className="block space-y-1 text-sm">
        <span>{t("code")}</span>
        <input name="code" required defaultValue={code} autoCapitalize="characters" className={`${storeField} font-mono`} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>{t("phone")}</span>
        <input name="phone" required type="tel" inputMode="tel" autoComplete="tel" className={storeField} />
      </label>
      {state?.error && <Notice tone="danger">{state.error}</Notice>}
      <button type="submit" disabled={pending} className={`${primaryButton} w-full`}>
        {t("submit")}
      </button>
    </form>
  );
}
