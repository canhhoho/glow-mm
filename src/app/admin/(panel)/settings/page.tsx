import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { bpToPercent } from "@/server/affiliates/commission";
import { getAllSettings, PERCENT_SETTING_KEYS, type NumericSettingKey } from "@/server/settings";
import { saveSettingsAction } from "@/server/settings-actions";
import { ActionForm } from "@/components/admin/action-form";
import { fieldClass, PageHeader } from "@/components/admin/ui";

const GROUPS: { title: string; keys: NumericSettingKey[] }[] = [
  { title: "expiry", keys: ["expiry.blockDays", "expiry.warnDays"] },
  { title: "orders", keys: ["reservation.transferHours", "cod.confirmHours"] },
  { title: "pricing", keys: ["pricing.roundTo"] },
  { title: "reorder", keys: ["reorder.coverDays", "reorder.salesWindowDays"] },
  { title: "affiliate", keys: ["affiliate.holdDays", "affiliate.defaultRateBp", "affiliate.uplineRateBp"] },
];

export default async function SettingsPage() {
  await requirePagePermission("settings:manage");
  const [t, settings] = await Promise.all([getTranslations("Settings"), getAllSettings()]);

  return (
    <div className="max-w-2xl">
      <PageHeader title={t("title")} />
      <ActionForm action={saveSettingsAction} submitLabel={t("save")} okText={t("saved")} className="space-y-5">
        <fieldset className="space-y-2 rounded-lg border p-4">
          <legend className="px-1 font-medium">{t("store")}</legend>
          <label className="flex items-center gap-2 text-sm">
            <input name="store.checkoutEnabled" type="checkbox" defaultChecked={settings.checkoutEnabled} className="size-4" />
            <span>{t("keys.store.checkoutEnabled")}</span>
          </label>
          <p className="text-xs text-muted-foreground">{t("checkoutHint")}</p>
        </fieldset>
        {GROUPS.map((g) => (
          <fieldset key={g.title} className="space-y-2 rounded-lg border p-4">
            <legend className="px-1 font-medium">{t(g.title)}</legend>
            {g.keys.map((k) => (
              <label key={k} className="grid items-center gap-2 text-sm sm:grid-cols-[1fr_8rem]">
                <span>{t(`keys.${k}`)}</span>
                {PERCENT_SETTING_KEYS.includes(k) ? (
                  <input
                    name={k}
                    type="number"
                    min={0}
                    max={50}
                    step={0.01}
                    inputMode="decimal"
                    required
                    defaultValue={bpToPercent(settings.numbers[k])}
                    className={fieldClass}
                  />
                ) : (
                  <input name={k} type="number" min={0} step={1} required defaultValue={settings.numbers[k]} className={fieldClass} />
                )}
              </label>
            ))}
          </fieldset>
        ))}
        <fieldset className="space-y-2 rounded-lg border p-4">
          <legend className="px-1 font-medium">{t("payment")}</legend>
          <label className="block space-y-1 text-sm">
            <span>{t("keys.payment.bankInstructions")}</span>
            <textarea
              name="payment.bankInstructions"
              rows={3}
              maxLength={1000}
              defaultValue={settings.bankInstructions}
              className={`${fieldClass} h-auto py-2`}
            />
          </label>
        </fieldset>
      </ActionForm>
    </div>
  );
}
