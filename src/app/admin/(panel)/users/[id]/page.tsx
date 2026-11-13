import { LockKeyhole, LockKeyholeOpen, Trash2, KeyRound } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { fmtDateTime } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/session";
import { MIN_STAFF_PASSWORD } from "@/server/auth/roles";
import { deleteStaffAction, resetStaffPasswordAction, setStaffActiveAction, updateStaffAction } from "@/server/users/actions";
import { getStaff } from "@/server/users/users";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm } from "@/components/admin/action-form";
import { RoleSelect } from "@/components/admin/role-select";
import { Badge, fieldClass, fieldLabelClass, Notice, Page, PageHeader, Section } from "@/components/admin/ui";

export default async function EditUserPage({ params }: PageProps<"/admin/users/[id]">) {
  const me = await requirePagePermission("users:manage");
  const { id } = await params;
  const [t, td, user] = await Promise.all([getTranslations("Users"), getTranslations("Docs"), getStaff(id)]);
  if (!user) notFound();
  const self = user.id === me.id;

  return (
    <Page width="narrow">
      <PageHeader
        title={user.name}
        back={{ href: "/admin/users", label: td("back") }}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{user.email}</span>
            <Badge tone={user.active ? "success" : "danger"}>{user.active ? t("active") : t("locked")}</Badge>
            <span>
              {t("createdAt")}: {fmtDateTime(user.createdAt)}
            </span>
          </span>
        }
      />
      {self && (
        <Notice>
          {t("selfNote")}{" "}
          <Link href="/admin/account" className="underline">
            {t("myAccount")}
          </Link>
        </Notice>
      )}

      <Section title={t("profile")}>
        <ActionForm action={updateStaffAction} submitLabel={t("save")} okText={t("saved")} className="space-y-3">
          <input type="hidden" name="id" value={user.id} />
          <label className={fieldLabelClass}>
            <span>{t("name")}</span>
            <input name="name" required maxLength={100} defaultValue={user.name} className={fieldClass} />
          </label>
          {/* Không tự đổi email của mình (đăng nhập bằng email) → trang của mình không có ô email. */}
          {!self && (
            <label className={fieldLabelClass}>
              <span>{t("email")}</span>
              <input name="email" type="email" required maxLength={254} defaultValue={user.email} className={fieldClass} />
            </label>
          )}
          <RoleSelect defaultValue={user.role} disabled={self} />
        </ActionForm>
      </Section>

      {!self && (
        <>
          <Section title={t("resetTitle")}>
            <ActionForm action={resetStaffPasswordAction} submitLabel={t("reset")} okText={t("resetDone")} className="space-y-3" icon={<KeyRound aria-hidden />}>
              <input type="hidden" name="id" value={user.id} />
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
              <p className="text-xs text-muted-foreground">{t("resetHint", { min: MIN_STAFF_PASSWORD })}</p>
            </ActionForm>
          </Section>

          <Section title={t("access")}>
            <p className="text-xs text-muted-foreground">{user.active ? t("lockHint") : t("unlockHint")}</p>
            <ActionButton
              action={setStaffActiveAction}
              fields={{ id: user.id, active: String(!user.active) }}
              label={user.active ? t("lock") : t("unlock")}
              variant={user.active ? "destructive" : "outline"}
              confirm={user.active ? t("lockConfirm", { name: user.name }) : undefined} iconOnly={false} icon={user.active ? <LockKeyhole aria-hidden /> : <LockKeyholeOpen aria-hidden />}
            />
            <p className="text-xs text-muted-foreground">{t("deleteHint")}</p>
            <ActionButton action={deleteStaffAction} fields={{ id: user.id }} label={t("delete")} variant="destructive" confirm={t("deleteConfirm", { name: user.name })} iconOnly={false} icon={<Trash2 aria-hidden />} />
          </Section>
        </>
      )}
    </Page>
  );
}
