import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { MIN_STAFF_PASSWORD } from "@/server/auth/roles";
import { createStaffAction } from "@/server/users/actions";
import { ActionForm } from "@/components/admin/action-form";
import { RoleSelect } from "@/components/admin/role-select";
import { fieldClass, fieldLabelClass, Page, PageHeader } from "@/components/admin/ui";

export default async function NewUserPage() {
  await requirePagePermission("users:manage");
  const [t, td] = await Promise.all([getTranslations("Users"), getTranslations("Docs")]);
  return (
    <Page width="narrow">
      <PageHeader title={t("new")} back={{ href: "/admin/users", label: td("back") }} />
      <ActionForm action={createStaffAction} submitLabel={t("create")} className="space-y-3" icon={<Plus aria-hidden className="size-4 shrink-0" />}>
        <label className={fieldLabelClass}>
          <span>{t("name")}</span>
          <input name="name" required maxLength={100} className={fieldClass} />
        </label>
        <label className={fieldLabelClass}>
          <span>{t("email")}</span>
          <input name="email" type="email" required maxLength={200} autoComplete="off" className={fieldClass} />
        </label>
        <RoleSelect />
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
        </label>
        <p className="text-xs text-muted-foreground">{t("tempPasswordHint", { min: MIN_STAFF_PASSWORD })}</p>
      </ActionForm>
    </Page>
  );
}
