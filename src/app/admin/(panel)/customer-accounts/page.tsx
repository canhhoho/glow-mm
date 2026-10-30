import { getTranslations } from "next-intl/server";
import { fmtDateTime } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/session";
import { isPhoneEmail } from "@/server/auth/customer-policy";
import { listCustomerAccounts } from "@/server/accounts/admin";
import { resetCustomerPasswordAction, setCustomerActiveAction } from "@/server/accounts/actions";
import { MIN_CUSTOMER_PASSWORD } from "@/server/accounts/phone";
import { ActionForm } from "@/components/admin/action-form";
import { Badge, DataTable, fieldClass, PageHeader, Td } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";

/**
 * Tài khoản khách storefront (P17): tìm theo SĐT / email / tên; đặt lại mật khẩu tạm (khách SĐT quên mật khẩu nhắn shop);
 * khoá / mở khoá. Khách đăng nhập Google không có mật khẩu → không đặt lại được.
 */
export default async function CustomerAccountsPage({ searchParams }: PageProps<"/admin/customer-accounts">) {
  await requirePagePermission("users:manage");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const [t, accounts] = await Promise.all([getTranslations("Customers"), listCustomerAccounts(q)]);

  return (
    <div className="max-w-6xl space-y-4">
      <PageHeader title={t("title")} />
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
      <form role="search" className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">{t("search")}</span>
          <input name="q" defaultValue={q} placeholder="09… / email / tên" className={fieldClass} />
        </label>
        <Button type="submit" variant="outline">
          {t("find")}
        </Button>
      </form>
      <DataTable
        stack
        empty={t("empty")}
        numeric={[3]}
        head={[t("name"), t("contact"), t("method"), t("orders"), t("createdAt"), t("status"), t("actions")]}
      >
        {accounts.map((a) => {
          const hasPassword = a.providers.includes("credential");
          return (
            <tr key={a.id} data-testid="customer-row">
              <Td className="font-medium md:font-normal">{a.name}</Td>
              <Td label={t("contact")} className="font-mono text-xs">
                {a.phoneNumber && <div>{a.phoneNumber}</div>}
                {!isPhoneEmail(a.email) && <div>{a.email}</div>}
              </Td>
              <Td label={t("method")}>
                <div className="flex flex-wrap gap-1">
                  {a.providers.includes("google") && <Badge>Google</Badge>}
                  {hasPassword && <Badge>{a.phoneNumber ? t("byPhone") : t("byEmail")}</Badge>}
                </div>
              </Td>
              <Td label={t("orders")} className="text-right tabular-nums">
                {a._count.orders}
              </Td>
              <Td label={t("createdAt")} className="text-xs whitespace-nowrap">
                {fmtDateTime(a.createdAt)}
              </Td>
              <Td label={t("status")}>
                <Badge tone={a.active ? "success" : "danger"}>{a.active ? t("active") : t("locked")}</Badge>
              </Td>
              <Td>
                <div className="flex w-full flex-col gap-2 md:w-auto md:min-w-60">
                  {hasPassword && (
                    <ActionForm action={resetCustomerPasswordAction} submitLabel={t("resetPassword")} variant="outline" className="space-y-1">
                      <input type="hidden" name="id" value={a.id} />
                      <input
                        name="password"
                        type="text"
                        required
                        minLength={MIN_CUSTOMER_PASSWORD}
                        maxLength={128}
                        autoComplete="off"
                        placeholder={t("tempPassword", { min: MIN_CUSTOMER_PASSWORD })}
                        aria-label={`${t("tempPassword", { min: MIN_CUSTOMER_PASSWORD })} — ${a.name}`}
                        className={fieldClass}
                      />
                    </ActionForm>
                  )}
                  <ActionForm
                    action={setCustomerActiveAction}
                    submitLabel={a.active ? t("lock") : t("unlock")}
                    variant={a.active ? "destructive" : "outline"}
                    confirm={a.active ? t("lockConfirm", { name: a.name }) : undefined}
                  >
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="active" value={a.active ? "false" : "true"} />
                  </ActionForm>
                </div>
              </Td>
            </tr>
          );
        })}
      </DataTable>
    </div>
  );
}
