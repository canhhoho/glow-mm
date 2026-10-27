import { getTranslations } from "next-intl/server";
import { MIN_STAFF_PASSWORD } from "@/server/auth/roles";
import type { CommissionState } from "@/server/affiliates/commission";
import { Badge, fieldClass, type TONES } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

/** Phần dùng chung của trang CTV (admin; cổng CTV dùng lại badge). */

const STATE_TONE: Record<CommissionState, keyof typeof TONES> = { pending: "warning", payable: "success", void: "neutral" };

export async function CommissionBadge({ state }: { state: CommissionState }) {
  const t = await getTranslations("Affiliates");
  return <Badge tone={STATE_TONE[state]}>{t(`commissionState.${state}`)}</Badge>;
}

export type AffiliateFieldValues = {
  name: string;
  phone: string;
  code: string;
  commissionPercent: number;
  payoutInfo: string | null;
};

/** Ô nhập hồ sơ CTV (tạo mới thêm email + mật khẩu tạm). */
export async function AffiliateFields({ values, withLogin }: { values?: Partial<AffiliateFieldValues>; withLogin?: boolean }) {
  const t = await getTranslations("Affiliates");
  return (
    <>
      <label className="block space-y-1 text-sm">
        <span>{t("name")}</span>
        <input name="name" required maxLength={100} defaultValue={values?.name} className={fieldClass} />
      </label>
      {withLogin && (
        <label className="block space-y-1 text-sm">
          <span>{t("email")}</span>
          <input name="email" type="email" required maxLength={200} autoComplete="off" className={fieldClass} />
        </label>
      )}
      <label className="block space-y-1 text-sm">
        <span>{t("phone")}</span>
        <input name="phone" type="tel" inputMode="tel" required maxLength={30} defaultValue={values?.phone} className={fieldClass} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>{t("code")}</span>
        <input
          name="code"
          required
          minLength={4}
          maxLength={12}
          pattern="[A-Za-z0-9]{4,12}"
          autoCapitalize="characters"
          defaultValue={values?.code}
          className={cn(fieldClass, "font-mono uppercase")}
        />
        <span className="block text-xs text-muted-foreground">{t("codeHint")}</span>
      </label>
      <label className="block space-y-1 text-sm">
        <span>{t("percent")}</span>
        <input
          name="commissionPercent"
          type="number"
          required
          min={0}
          max={50}
          step={0.01}
          inputMode="decimal"
          defaultValue={values?.commissionPercent}
          className={fieldClass}
        />
        <span className="block text-xs text-muted-foreground">{t("percentHint")}</span>
      </label>
      <label className="block space-y-1 text-sm">
        <span>{t("payoutInfo")}</span>
        <textarea name="payoutInfo" rows={2} maxLength={500} defaultValue={values?.payoutInfo ?? ""} className={cn(fieldClass, "h-auto py-1.5")} />
        <span className="block text-xs text-muted-foreground">{t("payoutInfoHint")}</span>
      </label>
      {withLogin && (
        <label className="block space-y-1 text-sm">
          <span>{t("tempPassword")}</span>
          <input
            name="password"
            type="password"
            required
            minLength={MIN_STAFF_PASSWORD}
            maxLength={128}
            autoComplete="new-password"
            className={fieldClass}
          />
          <span className="block text-xs text-muted-foreground">{t("tempPasswordHint", { min: MIN_STAFF_PASSWORD })}</span>
        </label>
      )}
    </>
  );
}
