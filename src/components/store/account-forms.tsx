"use client";

import { Save } from "lucide-react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { AddressCatalog } from "@/server/locations/locations";
import { AddressPicker } from "../address-picker";
import { useAddressLabels } from "./address-labels";
import { changeCustomerPasswordAction, saveAddressAction, updateProfileAction } from "@/server/accounts/actions";
import { Notice, outlineButton, primaryButton, storeField } from "./ui";
import { cn } from "@/lib/utils";

/** Form khu tài khoản khách (P14b) — Server Action, JS chỉ để hiện lỗi/trạng thái. */

export type AddressValues = {
  id: string;
  recipientName: string;
  phone: string;
  phone2: string | null;
  townshipId: string;
  line: string;
  note: string | null;
  isDefault: boolean;
};

export function AddressForm({
  locale,
  catalog,
  address,
}: {
  locale: string;
  catalog: AddressCatalog;
  address?: AddressValues;
}) {
  const t = useTranslations("Account");
  const ta = useTranslations("Address");
  const labels = useAddressLabels();
  const [state, action, pending] = useActionState(saveAddressAction, undefined);
  return (
    <form action={action} className="space-y-3" data-testid="address-form">
      <input type="hidden" name="locale" value={locale} />
      {address && <input type="hidden" name="id" value={address.id} />}
      <label className="block space-y-1 text-sm">
        <span>{t("recipientName")}</span>
        <input name="recipientName" required maxLength={100} autoComplete="name" defaultValue={address?.recipientName} className={storeField} />
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
          defaultValue={address?.phone}
          className={storeField}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>{ta("phone2")}</span>
        <input name="phone2" type="tel" inputMode="tel" defaultValue={address?.phone2 ?? ""} className={storeField} />
      </label>
      <AddressPicker catalog={catalog} labels={labels} defaultTownshipId={address?.townshipId} fieldClass={storeField} />
      <label className="block space-y-1 text-sm">
        <span>{t("line")}</span>
        <textarea
          name="line"
          required
          minLength={3}
          maxLength={500}
          rows={2}
          defaultValue={address?.line}
          className={`${storeField} h-auto py-2`}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>{t("note")}</span>
        <input name="note" maxLength={300} defaultValue={address?.note ?? ""} className={storeField} />
      </label>
      {!address?.isDefault && (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="isDefault" className="size-5 accent-brand" />
          {t("makeDefault")}
        </label>
      )}
      {state?.error && <Notice tone="danger">{state.error}</Notice>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={cn(primaryButton, "flex-1")}><Save aria-hidden className="size-4 shrink-0" /> {t("save")}</button>
        {address && (
          <Link href="/account/addresses" className={outlineButton}>
            {t("cancel")}
          </Link>
        )}
      </div>
    </form>
  );
}

export function ProfileForm({ locale, name }: { locale: string; name: string }) {
  const t = useTranslations("Account");
  const [state, action, pending] = useActionState(updateProfileAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="locale" value={locale} />
      <label className="block space-y-1 text-sm">
        <span>{t("name")}</span>
        <input name="name" required maxLength={100} autoComplete="name" defaultValue={name} className={storeField} />
      </label>
      {state?.error && <Notice tone="danger">{state.error}</Notice>}
      {state?.ok && <Notice tone="success">{t("saved")}</Notice>}
      <button type="submit" disabled={pending} className={primaryButton}><Save aria-hidden className="size-4 shrink-0" /> {t("save")}</button>
    </form>
  );
}

export function ChangePasswordForm({ locale }: { locale: string }) {
  const t = useTranslations("Account");
  const [state, action, pending] = useActionState(changeCustomerPasswordAction, undefined);
  const field = (name: string, label: string, autoComplete: string) => (
    <label className="block space-y-1 text-sm">
      <span>{label}</span>
      <input name={name} type="password" required maxLength={128} autoComplete={autoComplete} className={storeField} />
    </label>
  );
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="locale" value={locale} />
      {field("currentPassword", t("currentPassword"), "current-password")}
      {field("newPassword", t("newPassword"), "new-password")}
      {field("confirmPassword", t("confirmPassword"), "new-password")}
      {state?.error && <Notice tone="danger">{state.error}</Notice>}
      {state?.ok && <Notice tone="success">{t("passwordChanged")}</Notice>}
      <button type="submit" disabled={pending} className={primaryButton}>
        {t("changePassword")}
      </button>
    </form>
  );
}
