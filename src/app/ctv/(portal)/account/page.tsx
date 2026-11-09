import { KeyRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireAffiliate } from "@/server/auth/session";
import { changePasswordAction } from "@/server/auth/actions";
import { MIN_STAFF_PASSWORD } from "@/server/auth/roles";
import { ActionForm } from "@/components/admin/action-form";
import { PageHeader } from "@/components/admin/ui";
import { CtvLocaleSwitch, CtvSignOut } from "@/components/ctv/ctv-session-controls";
import { cn } from "@/lib/utils";
import { storeCard, storeField } from "@/components/store/ui";

export default async function CtvAccountPage() {
  const user = await requireAffiliate();
  const [t, ta, tNav] = await Promise.all([getTranslations("Account"), getTranslations("Ctv"), getTranslations("Nav")]);

  return (
    <div className="max-w-md space-y-4">
      <PageHeader title={ta("accountTitle")} />
      <p className="text-sm break-words text-muted-foreground">
        {user.name} · {user.email} · <span className="font-mono">{user.code}</span>
      </p>
      <div className={storeCard}>
        <h2 className="mb-3 font-medium">{t("title")}</h2>
        <ActionForm density="touch" action={changePasswordAction} submitLabel={t("submit")} okText={t("changed")} className="space-y-3" icon={<KeyRound aria-hidden className="size-4 shrink-0" />}>
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
                className={storeField}
              />
            </label>
          ))}
          <p className="text-xs text-muted-foreground">{t("hint", { min: MIN_STAFF_PASSWORD })}</p>
        </ActionForm>
      </div>
      {/* Trên mobile header không có ngôn ngữ / đăng xuất → đặt ở đây. */}
      <div className={cn(storeCard, "flex items-center justify-between gap-3")}>
        <h2 className="font-medium">{tNav("language")}</h2>
        <CtvLocaleSwitch />
      </div>
      <CtvSignOut buttonClassName="h-11 w-full" />
    </div>
  );
}
