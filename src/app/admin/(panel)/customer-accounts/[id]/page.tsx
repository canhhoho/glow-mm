import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { fmtDateTime } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/session";
import { isPhoneEmail } from "@/server/auth/customer-policy";
import { getCustomerAccount } from "@/server/accounts/admin";
import {
  deleteCustomerAccountAction,
  resetCustomerPasswordAction,
  setCustomerActiveAction,
  updateCustomerAccountAction,
} from "@/server/accounts/actions";
import { MIN_CUSTOMER_PASSWORD } from "@/server/accounts/phone";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm } from "@/components/admin/action-form";
import { Badge, fieldClass, fieldLabelClass, Page, PageHeader, Section } from "@/components/admin/ui";

/**
 * Sửa tài khoản khách: tên, SĐT đăng nhập (chỉ tài khoản SĐT), mật khẩu tạm (tài khoản có mật khẩu),
 * khoá / mở khoá, xoá (chỉ khi chưa có đơn). Cùng khuôn với trang sửa nhân viên.
 */
export default async function CustomerAccountPage({ params }: PageProps<"/admin/customer-accounts/[id]">) {
  await requirePagePermission("users:manage");
  const { id } = await params;
  const [t, tn, a] = await Promise.all([getTranslations("Customers"), getTranslations("Nav"), getCustomerAccount(id)]);
  if (!a) notFound();
  const hasPassword = a.providers.includes("credential");

  return (
    <Page width="narrow">
      <PageHeader
        title={a.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {!isPhoneEmail(a.email) && <span className="font-mono">{a.email}</span>}
            <Badge tone={a.active ? "success" : "danger"}>{a.active ? t("active") : t("locked")}</Badge>
            <span>
              {t("orders")}: {a._count.orders} · {t("createdAt")}: {fmtDateTime(a.createdAt)}
            </span>
          </span>
        }
        back={{ href: "/admin/customer-accounts", label: tn("customers") }}
      />

      <Section title={t("profile")}>
        <ActionForm action={updateCustomerAccountAction} submitLabel={t("save")} okText={t("saved")} className="space-y-3">
          <input type="hidden" name="id" value={a.id} />
          <label className={fieldLabelClass}>
            <span>{t("name")}</span>
            <input name="name" required maxLength={100} defaultValue={a.name} className={fieldClass} />
          </label>
          {a.phoneNumber && (
            <label className={fieldLabelClass}>
              <span>{t("phone")}</span>
              <input name="phone" type="tel" required maxLength={32} defaultValue={a.phoneNumber} className={fieldClass} />
              <span className="text-xs text-muted-foreground">{t("phoneHint")}</span>
            </label>
          )}
        </ActionForm>
      </Section>

      {hasPassword && (
        <Section title={t("resetPassword")}>
          <p className="text-xs text-muted-foreground">{t("passwordHint")}</p>
          <ActionForm action={resetCustomerPasswordAction} submitLabel={t("resetPassword")} variant="outline" className="space-y-3">
            <input type="hidden" name="id" value={a.id} />
            <label className={fieldLabelClass}>
              <span>{t("tempPassword", { min: MIN_CUSTOMER_PASSWORD })}</span>
              <input name="password" type="text" required minLength={MIN_CUSTOMER_PASSWORD} maxLength={128} autoComplete="off" className={fieldClass} />
            </label>
          </ActionForm>
        </Section>
      )}

      <Section title={t("access")}>
        <p className="text-xs text-muted-foreground">{t("lockHint")}</p>
        <ActionButton
          action={setCustomerActiveAction}
          fields={{ id: a.id, active: String(!a.active) }}
          label={a.active ? t("lock") : t("unlock")}
          variant={a.active ? "destructive" : "outline"}
          confirm={a.active ? t("lockConfirm", { name: a.name }) : undefined}
        />
        <p className="text-xs text-muted-foreground">{t("deleteHint")}</p>
        <ActionButton action={deleteCustomerAccountAction} fields={{ id: a.id }} label={t("delete")} variant="destructive" confirm={t("deleteConfirm", { name: a.name })} />
      </Section>
    </Page>
  );
}
