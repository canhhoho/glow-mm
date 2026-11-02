import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { createAffiliateAction } from "@/server/affiliates/actions";
import { affiliateOptions, suggestAffiliateCode } from "@/server/affiliates/affiliates";
import { bpToPercent } from "@/server/affiliates/commission";
import { getNumberSetting } from "@/server/settings";
import { ActionForm } from "@/components/admin/action-form";
import { AffiliateFields } from "@/components/admin/affiliate-parts";
import { fieldClass, Page, PageHeader } from "@/components/admin/ui";

export default async function NewAffiliatePage() {
  await requirePagePermission("affiliates:manage");
  const [t, options, defaultBp, uplineBp] = await Promise.all([
    getTranslations("Affiliates"),
    affiliateOptions(),
    getNumberSetting("affiliate.defaultRateBp"),
    getNumberSetting("affiliate.uplineRateBp"),
  ]);
  return (
    <Page width="narrow">
      <PageHeader title={t("new")} back={{ href: "/admin/affiliates", label: t("back") }} />
      <ActionForm action={createAffiliateAction} submitLabel={t("create")} className="space-y-3">
        <AffiliateFields
          withLogin
          values={{ code: suggestAffiliateCode(), commissionPercent: bpToPercent(defaultBp) }}
          globalUplinePercent={bpToPercent(uplineBp)}
        />
        <label className="block space-y-1 text-sm">
          <span>{t("tree.parentOptional")}</span>
          <select name="parentId" defaultValue="" className={fieldClass}>
            <option value="">{t("tree.noParent")}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </ActionForm>
    </Page>
  );
}
