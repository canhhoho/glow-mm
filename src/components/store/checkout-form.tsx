"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { placeOrderAction } from "@/server/cart/actions";
import { Notice, primaryButton, storeField } from "./ui";

export type CheckoutZone = { id: string; label: string };

/** Form checkout 1 trang. Chỉ dùng JS để hiện lỗi/trạng thái gửi; giá và tồn kiểm lại ở server. */
export function CheckoutForm({
  locale,
  zones,
  idempotencyKey,
}: {
  locale: string;
  zones: CheckoutZone[];
  idempotencyKey: string;
}) {
  const t = useTranslations("Checkout");
  const [state, action, pending] = useActionState(placeOrderAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <fieldset className="space-y-3">
        <legend className="mb-1 font-medium">{t("contact")}</legend>
        <label className="block space-y-1 text-sm">
          <span>{t("name")}</span>
          <input name="name" required maxLength={100} autoComplete="name" className={storeField} />
        </label>
        <label className="block space-y-1 text-sm">
          <span>{t("phone")}</span>
          <input
            name="phone"
            required
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={t("phoneHint")}
            className={storeField}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>{t("zone")}</span>
          <select name="zoneId" required defaultValue="" className={storeField}>
            <option value="" disabled>
              {t("chooseZone")}
            </option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span>{t("address")}</span>
          <textarea name="addressLine" required minLength={3} maxLength={500} rows={2} className={`${storeField} h-auto py-2`} />
        </label>
        <label className="block space-y-1 text-sm">
          <span>{t("note")}</span>
          <input name="note" maxLength={500} className={storeField} />
        </label>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-1 font-medium">{t("payment")}</legend>
        {(
          [
            ["COD", t("cod"), t("codHint")],
            ["BANK_TRANSFER", t("bank"), t("bankHint")],
          ] as const
        ).map(([value, label, hint]) => (
          <label
            key={value}
            className="flex min-h-11 items-start gap-3 rounded-lg border border-border bg-card p-3 has-checked:border-brand"
          >
            <input type="radio" name="paymentMethod" value={value} required defaultChecked={value === "COD"} className="mt-1" />
            <span>
              <span className="block">{label}</span>
              <span className="block text-xs text-muted-foreground">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {state?.error && <Notice tone="error">{state.error}</Notice>}
      <button type="submit" disabled={pending} className={`${primaryButton} w-full`}>
        {t("place")}
      </button>
    </form>
  );
}
