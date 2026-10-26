import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { createAffiliateAction } from "@/server/affiliates/actions";
import { suggestAffiliateCode } from "@/server/affiliates/affiliates";
import { ActionForm } from "@/components/admin/action-form";
import { AffiliateFields } from "@/components/admin/affiliate-parts";
import { LinkButton, PageHeader } from "@/components/admin/ui";

export default async function NewAffiliatePage() {
  await requirePagePermission("affiliates:manage");
  const t = await getTranslations("Affiliates");
  return (
    <div className="max-w-md">
      <PageHeader title={t("new")} actions={<LinkButton href="/admin/affiliates">← {t("back")}</LinkButton>} />
      <ActionForm action={createAffiliateAction} submitLabel={t("create")} className="space-y-3">
        <AffiliateFields withLogin values={{ code: suggestAffiliateCode(), commissionPercent: 10 }} />
      </ActionForm>
    </div>
  );
}
