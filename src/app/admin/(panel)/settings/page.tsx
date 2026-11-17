import Link from "next/link";
import { ArrowUpRight, Clock, Handshake, Package, ShoppingBag, SlidersHorizontal, Tags, TrendingUp, UserRound, Users, Wallet, type LucideIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { activeAccountCounts } from "@/server/users/users";
import { bpToPercent } from "@/server/affiliates/commission";
import { getAllSettings, PERCENT_SETTING_KEYS, type NumericSettingKey } from "@/server/settings";
import { saveSettingsAction } from "@/server/settings-actions";
import { ActionForm } from "@/components/admin/action-form";
import { fieldClass, fieldLabelClass, focusRing, Page, PageHeader } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { FEATURES } from "@/lib/features";

const GROUPS: { title: string; icon: LucideIcon; keys: NumericSettingKey[] }[] = [
  { title: "expiry", icon: Clock, keys: ["expiry.blockDays", "expiry.warnDays"] },
  { title: "orders", icon: Package, keys: ["reservation.transferHours", "cod.confirmHours", "preorder.defaultLimit"] },
  { title: "pricing", icon: Tags, keys: ["pricing.roundTo", "pricing.previewDays"] },
  { title: "reorder", icon: TrendingUp, keys: ["reorder.coverDays", "reorder.salesWindowDays"] },
  { title: "affiliate", icon: Handshake, keys: ["affiliate.holdDays", "affiliate.defaultRateBp", "affiliate.uplineRateBp"] },
];

export default async function SettingsPage() {
  await requirePagePermission("settings:manage");
  const [t, tn, settings, counts] = await Promise.all([
    getTranslations("Settings"),
    getTranslations("Nav"),
    getAllSettings(),
    activeAccountCounts(),
  ]);
  const accountLinks = [
    { href: "/admin/users", label: tn("users"), hint: t("staffHint"), icon: Users, count: counts.staff },
    { href: "/admin/affiliates", label: tn("affiliates"), hint: t("affiliateHint"), icon: Handshake, count: counts.affiliates },
    { href: "/admin/customer-accounts", label: tn("customers"), hint: t("customersHint"), icon: UserRound, count: counts.customers },
  ];

  return (
    <Page>
      <PageHeader title={tn("storeSettings")} description={t("description")} />
      <section className="space-y-3" data-testid="settings-accounts" aria-labelledby="settings-accounts-title">
        <div>
          <h2 id="settings-accounts-title" className="font-medium">{t("accounts")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("accountsHint")}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {accountLinks.map((l) => (
            <Link key={l.href} href={l.href} className={cn(focusRing, "group flex h-full flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs transition-colors hover:border-primary/40")}>
              <div className="flex items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><l.icon className="size-5" aria-hidden /></span>
                <h3 className="font-medium">{l.label}</h3>
                <ArrowUpRight className="ml-auto size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden />
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">{l.hint}</p>
              <div className="mt-auto flex items-baseline gap-2 border-t pt-3">
                <span className="text-2xl font-semibold tabular-nums">{l.count}</span>
                <span className="text-xs text-muted-foreground">{t("activeLabel")}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <section aria-labelledby="settings-operations-title" className="space-y-3">
        <div>
          <h2 id="settings-operations-title" className="flex items-center gap-2 font-medium"><SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden />{t("operations")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("operationsHint")}</p>
        </div>
        <ActionForm action={saveSettingsAction} submitLabel={t("save")} okText={t("saved")} className="space-y-4 [&>div:last-of-type]:rounded-xl [&>div:last-of-type]:border [&>div:last-of-type]:bg-card [&>div:last-of-type]:p-3 [&>div:last-of-type]:shadow-xs">
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3 [&>*]:min-w-0">
            <fieldset className="space-y-4 rounded-xl border bg-card p-4">
              <legend className="inline-flex items-center gap-2 px-1 text-sm font-medium"><ShoppingBag className="size-4 text-primary" aria-hidden />{t("store")}</legend>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border bg-muted/30 p-3 text-sm font-medium">
                <input name="store.checkoutEnabled" type="checkbox" defaultChecked={settings.checkoutEnabled} className="size-5 shrink-0 accent-primary" />
                <span>{t("keys.store.checkoutEnabled")}</span>
              </label>
              <p className="text-xs leading-relaxed text-muted-foreground">{t("checkoutHint")}</p>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border bg-muted/30 p-3 text-sm font-medium">
                <input name="orders.requirePickList" type="checkbox" defaultChecked={settings.requirePickList} className="size-5 shrink-0 accent-primary" />
                <span>{t("keys.orders.requirePickList")}</span>
              </label>
              <p className="text-xs leading-relaxed text-muted-foreground">{t("requirePickHint")}</p>
            </fieldset>
            {GROUPS.map((g) => (
              <fieldset key={g.title} className="space-y-4 rounded-xl border bg-card p-4">
                <legend className="inline-flex items-center gap-2 px-1 text-sm font-medium"><g.icon className="size-4 text-primary" aria-hidden />{t(g.title)}</legend>
                {g.keys.map((k) =>
                  // Giá tự động tắt: ô "hạn bản tính giá" chỉ còn là ô ẩn giữ giá trị (action lưu cài đặt đọc đủ mọi khoá số).
                  k === "pricing.previewDays" && !FEATURES.autoPricing ? (
                    <input key={k} type="hidden" name={k} value={settings.numbers[k]} />
                  ) : (
                  <label key={k} className={fieldLabelClass}>
                    <span className="text-muted-foreground">{t(`keys.${k}`)}</span>
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
                        className={cn(fieldClass, "tabular-nums")}
                      />
                    ) : (
                      <input name={k} type="number" min={0} step={1} required defaultValue={settings.numbers[k]} className={cn(fieldClass, "tabular-nums")} />
                    )}
                  </label>
                  ),
                )}
              </fieldset>
            ))}
            <fieldset className="space-y-3 rounded-xl border bg-card p-4 lg:col-span-2 2xl:col-span-3">
              <legend className="inline-flex items-center gap-2 px-1 text-sm font-medium"><Wallet className="size-4 text-primary" aria-hidden />{t("payment")}</legend>
              <label className={fieldLabelClass}>
                <span className="text-muted-foreground">{t("keys.payment.bankInstructions")}</span>
                <textarea
                  name="payment.bankInstructions"
                  rows={3}
                  maxLength={1000}
                  defaultValue={settings.bankInstructions}
                  className={cn(fieldClass, "h-auto py-2")}
                />
              </label>
            </fieldset>
          </div>
        </ActionForm>
      </section>
    </Page>
  );
}
