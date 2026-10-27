"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import type { AddressCatalog } from "@/server/locations/locations";
import { placeOrderAction } from "@/server/cart/actions";
import { AddressPicker } from "../address-picker";
import { Notice, primaryButton, storeField } from "./ui";
import { useAddressLabels } from "./address-labels";

/** Địa chỉ trong sổ địa chỉ của khách (P14c) — mặc định đứng đầu. */
export type SavedAddress = {
  id: string;
  label: string;
  recipientName: string;
  phone: string;
  phone2: string | null;
  townshipId: string;
  line: string;
  note: string | null;
};

/**
 * Form checkout 1 trang (khách đã đăng nhập — P14c). Chọn địa chỉ đã lưu → điền sẵn các ô (vẫn sửa được);
 * "Địa chỉ mới" → ô trống + tuỳ chọn lưu vào sổ địa chỉ. Giá và tồn kiểm lại ở server.
 */
export function CheckoutForm({
  locale,
  catalog,
  idempotencyKey,
  addresses,
  accountName,
}: {
  locale: string;
  catalog: AddressCatalog;
  idempotencyKey: string;
  addresses: SavedAddress[];
  accountName: string;
}) {
  const t = useTranslations("Checkout");
  const ta = useTranslations("Address");
  const labels = useAddressLabels();
  const [state, action, pending] = useActionState(placeOrderAction, undefined);
  const [selected, setSelected] = useState(addresses[0]?.id ?? "new");
  const a = addresses.find((x) => x.id === selected);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {addresses.length > 0 && (
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("savedAddress")}</span>
          <select value={selected} onChange={(e) => setSelected(e.target.value)} className={storeField}>
            {addresses.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
            <option value="new">{t("newAddress")}</option>
          </select>
        </label>
      )}
      {/* key: đổi địa chỉ đã chọn → các ô nhận lại giá trị mặc định mới. */}
      <fieldset key={selected} className="space-y-3">
        <legend className="mb-1 font-medium">{t("contact")}</legend>
        <label className="block space-y-1 text-sm">
          <span>{t("name")}</span>
          <input
            name="name"
            required
            maxLength={100}
            autoComplete="name"
            defaultValue={a?.recipientName ?? accountName}
            className={storeField}
          />
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
            defaultValue={a?.phone}
            className={storeField}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>{ta("phone2")}</span>
          <input name="phone2" type="tel" inputMode="tel" defaultValue={a?.phone2 ?? ""} className={storeField} />
        </label>
        {/* Thị trấn của địa chỉ đã lưu có thể đã ngừng giao → picker để trống cho khách chọn lại. */}
        <AddressPicker catalog={catalog} labels={labels} defaultTownshipId={a?.townshipId} fieldClass={storeField} />
        <label className="block space-y-1 text-sm">
          <span>{t("address")}</span>
          <textarea
            name="addressLine"
            required
            minLength={3}
            maxLength={500}
            rows={2}
            defaultValue={a?.line}
            className={`${storeField} h-auto py-2`}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>{t("note")}</span>
          <input name="note" maxLength={500} defaultValue={a?.note ?? ""} className={storeField} />
        </label>
        {!a && (
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="saveAddress" defaultChecked className="size-5 accent-brand" />
            {t("saveToBook")}
          </label>
        )}
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
