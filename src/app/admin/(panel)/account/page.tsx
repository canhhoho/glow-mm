import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/server/auth/session";
import { changePasswordAction } from "@/server/auth/actions";
import { MIN_STAFF_PASSWORD } from "@/server/auth/roles";
import { ActionForm } from "@/components/admin/action-form";
import { fieldClass, Page, PageHeader } from "@/components/admin/ui";

export default async function AccountPage() {
  const user = await requireStaff();
  const t = await getTranslations("Account");

  return (
    <Page width="narrow">
      <PageHeader title={t("title")} />
      <p className="mb-4 text-sm text-muted-foreground">
        {user.name} · {user.email}
      </p>
      <ActionForm action={changePasswordAction} submitLabel={t("submit")} okText={t("changed")} className="space-y-3">
        {(["currentPassword", "newPassword", "confirmPassword"] as const).map((name) => (
          <label key={name} className="grid content-start gap-1 text-sm">
            <span>{t(name)}</span>
            <input
              name={name}
              type="password"
              required
              minLength={name === "currentPassword" ? 1 : MIN_STAFF_PASSWORD}
              maxLength={128}
              autoComplete={name === "currentPassword" ? "current-password" : "new-password"}
              className={fieldClass}
            />
          </label>
        ))}
        <p className="text-xs text-muted-foreground">{t("hint", { min: MIN_STAFF_PASSWORD })}</p>
      </ActionForm>
    </Page>
  );
}
