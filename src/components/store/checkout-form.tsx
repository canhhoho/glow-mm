"use client";

import { startTransition, useActionState, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import type { AddressCatalog } from "@/server/locations/locations";
import { placeOrderAction } from "@/server/cart/actions";
import { AddressPicker } from "../address-picker";
import { Notice, primaryButton, storeField, storeLabel } from "./ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { useAddressLabels } from "./address-labels";
import { analyticsContext } from "@/lib/analytics-client";

const noopSubscribe = () => () => {};

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
  accountPhone,
  expectedTotalMmk,
  expectedPreorder = false,
  summary,
}: {
  locale: string;
  catalog: AddressCatalog;
  idempotencyKey: string;
  addresses: SavedAddress[];
  accountName: string;
  /** SĐT của tài khoản SĐT (P17) — điền sẵn khi chưa có địa chỉ đã lưu. */
  accountPhone?: string | null;
  expectedTotalMmk: number;
  expectedPreorder?: boolean;
  summary?: ReactNode;
}) {
  const t = useTranslations("Checkout");
  const ta = useTranslations("Address");
  const labels = useAddressLabels();
  const [state, action, pending] = useActionState(placeOrderAction, undefined);
  const [selected, setSelected] = useState(addresses[0]?.id ?? "new");
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const a = addresses.find((x) => x.id === selected);
  const currentExpectedTotal =
    state?.priceChanged && typeof state.newTotal === "number" ? state.newTotal : expectedTotalMmk;
  const currentExpectedPreorder = state?.needsPreorderConfirm ? true : expectedPreorder;
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state?.error) return;
    const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? formRef.current?.querySelector<HTMLElement>('[role="alert"]');
    first?.scrollIntoView({ behavior: "smooth", block: "center" });
    first?.focus({ preventScroll: true });
  }, [state]);
  const field = (name: string) => ({ "aria-invalid": !!state?.fieldErrors?.[name], "aria-describedby": state?.fieldErrors?.[name] ? `checkout-${name}-error` : undefined });
  const errorFor = (name: string) => state?.fieldErrors?.[name] ? <p id={`checkout-${name}-error`} className="text-sm text-destructive">{state.fieldErrors[name]}</p> : null;
  return (
    // `action={…}` làm React reset form sau MỌI lần gửi → server báo lỗi (hết hàng, SĐT sai…) thì khách mất tên,
    // địa chỉ, cách thanh toán vừa nhập và các ô chọn địa chỉ lệch với state. Gửi qua onSubmit để giữ nguyên;
    // thành công thì server redirect sang trang đơn. Nút khoá đến khi hydrate xong (Slow 3G) để không gửi form
    // kiểu trình duyệt; method="post" để dù vậy dữ liệu khách cũng không lên URL.
    <form
      ref={formRef}
      method="post"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        try {
          const analytics = analyticsContext();
          if (analytics) { fd.set("analyticsSessionId", analytics.sessionId); fd.set("analyticsDevice", analytics.device); }
        } catch { /* Analytics không được cản đặt hàng. */ }
        startTransition(() => action(fd));
      }}
      className="space-y-4"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="expectedTotalMmk" value={currentExpectedTotal} />
      <input type="hidden" name="expectedPreorder" value={currentExpectedPreorder ? "1" : "0"} />
      {addresses.length > 0 && (
        <label className={storeLabel}>
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
        <label className={storeLabel}>
          <span>{t("name")}</span>
          <input
            name="name"
            {...field("name")}
            required
            maxLength={100}
            autoComplete="name"
            defaultValue={a?.recipientName ?? accountName}
            className={storeField}
          />
          {errorFor("name")}
        </label>
        <label className={storeLabel}>
          <span>{t("phone")}</span>
          <input
            name="phone"
            {...field("phone")}
            required
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={t("phoneHint")}
            defaultValue={a?.phone ?? accountPhone ?? undefined}
            className={storeField}
          />
          {errorFor("phone")}
        </label>
        <label className={storeLabel}>
          <span>{ta("phone2")}</span>
          <input name="phone2" {...field("phone2")} type="tel" inputMode="tel" defaultValue={a?.phone2 ?? ""} className={storeField} />
          {errorFor("phone2")}
        </label>
        {/* Thị trấn của địa chỉ đã lưu có thể đã ngừng giao → picker để trống cho khách chọn lại. */}
        <AddressPicker catalog={catalog} labels={labels} defaultTownshipId={a?.townshipId} fieldClass={storeField} error={state?.fieldErrors?.townshipId} errorId="checkout-townshipId-error" />
        <label className={storeLabel}>
          <span>{t("address")}</span>
          <textarea
            name="addressLine"
            {...field("addressLine")}
            required
            minLength={3}
            maxLength={500}
            rows={2}
            defaultValue={a?.line}
            className={`${storeField} h-auto py-2`}
          />
          {errorFor("addressLine")}
        </label>
        <label className={storeLabel}>
          <span>{t("note")}</span>
          <input name="note" {...field("note")} maxLength={500} defaultValue={a?.note ?? ""} className={storeField} />
          {errorFor("note")}
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
            <input type="radio" name="paymentMethod" {...field("paymentMethod")} value={value} required defaultChecked={value === "COD"} className="mt-1" />
            <span>
              <span className="block">{label}</span>
              <span className="block text-xs text-muted-foreground">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {errorFor("paymentMethod")}
      {state?.needsPreorderConfirm || (state?.priceChanged && typeof state.newTotal === "number") ? (
        <Notice tone="warning" data-testid={state?.needsPreorderConfirm ? "preorder-confirm-notice" : "price-changed-notice"}>
          {state.error}
        </Notice>
      ) : (
        state?.error && !Object.keys(state.fieldErrors ?? {}).length && (
          <Notice tone="danger">
            {state.error}{state.sku && <span> · {state.sku}</span>}
          </Notice>
        )
      )}
      {state?.cartError && <Link href="/cart" className="underline">{t("reviewCart")}</Link>}
      {summary}
      <SubmitButton pending={pending} disabled={!hydrated} className={`${primaryButton} w-full`} data-testid="place-order-button">
        {state?.needsPreorderConfirm
          ? t("preorderConfirm")
          : state?.priceChanged
            ? t("priceChangedConfirm")
            : t("place")}
      </SubmitButton>
    </form>
  );
}
