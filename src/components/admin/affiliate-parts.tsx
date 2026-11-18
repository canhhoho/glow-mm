import { getTranslations } from "next-intl/server";
import { MIN_STAFF_PASSWORD } from "@/server/auth/roles";
import type { CommissionState } from "@/server/affiliates/commission";
import { Badge, fieldClass, fieldLabelClass, type TONES } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

/** Phần dùng chung của trang CTV (admin; cổng CTV dùng lại badge). */

const STATE_TONE: Record<CommissionState, keyof typeof TONES> = { pending: "warning", payable: "success", void: "neutral" };

export async function CommissionBadge({ state }: { state: CommissionState }) {
  const t = await getTranslations("Affiliates");
  return <Badge tone={STATE_TONE[state]}>{t(`commissionState.${state}`)}</Badge>;
}

export type AffiliateFieldValues = {
  name: string;
  /** Email đăng nhập (form sửa; form tạo mới để trống). */
  email: string;
  phone: string;
  code: string;
  /** % hưởng từ tuyến dưới (P13); null = dùng % chung. */
  uplinePercent: number | null;
  payoutInfo: string | null;
};

/** Ô nhập hồ sơ CTV, kể cả email đăng nhập (tạo mới thêm mật khẩu tạm). `globalUplinePercent` = % tầng trên chung (gợi ý khi để trống). */
export async function AffiliateFields({
  values,
  withLogin,
  globalUplinePercent,
}: {
  values?: Partial<AffiliateFieldValues>;
  withLogin?: boolean;
  globalUplinePercent: number;
}) {
  const t = await getTranslations("Affiliates");
  return (
    <>
      <label className={fieldLabelClass}>
        <span>{t("name")}</span>
        <input name="name" required maxLength={100} defaultValue={values?.name} className={fieldClass} />
      </label>
      <label className={fieldLabelClass}>
        <span>{t("email")}</span>
        <input name="email" type="email" required maxLength={200} autoComplete="off" defaultValue={values?.email} className={fieldClass} />
      </label>
      <label className={fieldLabelClass}>
        <span>{t("phone")}</span>
        <input name="phone" type="tel" inputMode="tel" required maxLength={30} defaultValue={values?.phone} className={fieldClass} />
      </label>
      <label className={fieldLabelClass}>
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
      {/* 18/11/2026: không còn % bán hàng theo CTV — hoa hồng bán hàng theo mức nhập ở Giá bán. */}
      <p className="text-xs text-muted-foreground">{t("percentHint")}</p>
      <label className={fieldLabelClass}>
        <span>{t("uplinePercent")}</span>
        <input
          name="uplinePercent"
          type="number"
          min={0}
          max={20}
          step={0.01}
          inputMode="decimal"
          defaultValue={values?.uplinePercent ?? ""}
          placeholder={t("uplinePercentDefault", { percent: globalUplinePercent })}
          className={fieldClass}
        />
        <span className="block text-xs text-muted-foreground">{t("uplinePercentHint", { percent: globalUplinePercent })}</span>
      </label>
      <label className={fieldLabelClass}>
        <span>{t("payoutInfo")}</span>
        <textarea name="payoutInfo" rows={2} maxLength={500} defaultValue={values?.payoutInfo ?? ""} className={cn(fieldClass, "h-auto py-1.5")} />
        <span className="block text-xs text-muted-foreground">{t("payoutInfoHint")}</span>
      </label>
      {withLogin && (
        <label className={fieldLabelClass}>
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
