"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { uploadProofAction } from "@/server/cart/actions";
import { Notice, primaryButton } from "./ui";

/** Upload biên lai chuyển khoản (ảnh chụp màn hình / PDF). */
export function ProofForm({ locale, code }: { locale: string; code: string }) {
  const t = useTranslations("Order");
  const [state, action, pending] = useActionState(uploadProofAction, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="code" value={code} />
      <label className="block space-y-1 text-sm">
        <span className="font-medium">{t("uploadTitle")}</span>
        <input
          name="file"
          type="file"
          required
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-accent file:px-4"
        />
        <span className="block text-xs text-muted-foreground">{t("uploadHint")}</span>
      </label>
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      <button type="submit" disabled={pending} className={`${primaryButton} w-full`}>
        {t("upload")}
      </button>
    </form>
  );
}
