import { getTranslations } from "next-intl/server";
import { requireAffiliate } from "@/server/auth/session";
import { changePasswordAction } from "@/server/auth/actions";
import { MIN_STAFF_PASSWORD } from "@/server/auth/roles";
import { ActionForm } from "@/components/admin/action-form";
import { fieldClass } from "@/components/admin/ui";
import { CtvLocaleSwitch, CtvSignOut } from "@/components/ctv/ctv-session-controls";

export default async function CtvAccountPage() {
  const user = await requireAffiliate();
  const [t, ta, tNav] = await Promise.all([getTranslations("Account"), getTranslations("Ctv"), getTranslations("Nav")]);

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-xl font-semibold">{ta("accountTitle")}</h1>
      <p className="text-sm break-words text-muted-foreground">
        {user.name} · {user.email} · <span className="font-mono">{user.code}</span>
      </p>
      <div className="rounded-2xl border bg-card p-4">
        <h2 className="mb-3 font-medium">{t("title")}</h2>
        <ActionForm action={changePasswordAction} submitLabel={t("submit")} okText={t("changed")} className="space-y-3">
          {(["currentPassword", "newPassword", "confirmPassword"] as const).map((name) => (
            <label key={name} className="block space-y-1 text-sm">
              <span>{t(name)}</span>
              <input
                name={name}
                type="password"
                required
                minLength={name === "currentPassword" ? 1 : MIN_STAFF_PASSWORD}
                maxLength={128}
                autoComplete={name === "currentPassword" ? "current-password" : "new-password"}
                className={`${fieldClass} h-10`}
              />
            </label>
          ))}
          <p className="text-xs text-muted-foreground">{t("hint", { min: MIN_STAFF_PASSWORD })}</p>
        </ActionForm>
      </div>
      {/* Trên mobile header không có ngôn ngữ / đăng xuất → đặt ở đây. */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-4">
        <h2 className="font-medium">{tNav("language")}</h2>
        <CtvLocaleSwitch />
      </div>
      <CtvSignOut buttonClassName="h-11 w-full" />
    </div>
  );
}
