"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { submitReviewAction } from "@/server/reviews/actions";
import { Notice, outlineButton, storeField, storeLabel } from "./ui";
import { SubmitButton } from "@/components/ui/submit-button";

/** Đánh giá 1 sản phẩm trong đơn đã giao: 1–5 sao (radio, không cần JS để chọn) + nhận xét. */
export function ReviewForm({ locale, code, productId, name }: { locale: string; code: string; productId: string; name: string }) {
  const t = useTranslations("Review");
  const [state, action, pending] = useActionState(submitReviewAction, undefined);
  return (
    <form action={action} className="space-y-2 rounded-lg border border-border bg-card p-3" aria-label={name}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="productId" value={productId} />
      <p className="text-sm font-medium">{name}</p>
      <fieldset className="group/rating flex flex-row-reverse justify-end gap-1 [&>label:has(input:checked)~label]:text-brand-dark [&>label:hover~label]:text-brand-dark">
        <legend className="sr-only">{t("rating")}</legend>
        {/* DOM 5→1, hiển thị đảo lại 1→5: chọn sao N thì tô sao N và các sao đứng sau trong DOM (nhỏ hơn). */}
        {[5, 4, 3, 2, 1].map((n) => (
          <label
            key={n}
            className="cursor-pointer rounded p-0.5 text-2xl leading-none text-muted-foreground transition-colors hover:text-brand-dark has-checked:text-brand-dark has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand"
          >
            <input type="radio" name="rating" value={n} required className="sr-only" aria-label={t("stars", { n })} />
            <span aria-hidden>★</span>
          </label>
        ))}
      </fieldset>
      <label className={storeLabel}>
        <span className="text-muted-foreground">{t("body")}</span>
        <textarea name="body" rows={2} maxLength={1000} className={`${storeField} h-auto py-2`} />
      </label>
      {state?.error && <Notice tone="danger">{state.error}</Notice>}
      <SubmitButton pending={pending} className={outlineButton}>
        {t("submit")}
      </SubmitButton>
    </form>
  );
}
