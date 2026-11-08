import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ChevronDown, Info, KeyRound, Mail, Phone } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/session";
import { isPhoneEmail } from "@/server/auth/customer-policy";
import { listCustomerAccounts } from "@/server/accounts/admin";
import { resetCustomerPasswordAction, setCustomerActiveAction } from "@/server/accounts/actions";
import { MIN_CUSTOMER_PASSWORD } from "@/server/accounts/phone";
import { ActionForm } from "@/components/admin/action-form";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Badge, DataTable, fieldClass, FilterBar, FilterButton, Page, PageHeader, SearchInput, Stat, Td } from "@/components/admin/ui";

/**
 * Tài khoản khách storefront (P17): tìm theo SĐT / email / tên; đặt lại mật khẩu tạm (khách SĐT quên mật khẩu nhắn shop);
 * khoá / mở khoá. Khách đăng nhập Google không có mật khẩu → không đặt lại được.
 */
export default async function CustomerAccountsPage({ searchParams }: PageProps<"/admin/customer-accounts">) {
  await requirePagePermission("users:manage");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const [t, accounts] = await Promise.all([getTranslations("Customers"), listCustomerAccounts(q)]);
  const activeCount = accounts.filter((a) => a.active).length;

  return (
    <Page>
      <PageHeader title={(await getTranslations("Nav"))("customers")} description={t("description")} />
      <div className="grid grid-cols-3 gap-3" data-testid="customer-summary">
        <Stat label={t("listCount")} value={accounts.length} />
        <Stat label={t("active")} value={activeCount} />
        <Stat label={t("locked")} value={accounts.length - activeCount} />
      </div>
      <section aria-labelledby="customer-list-title" className="space-y-3 [&_td]:align-middle">
        <h2 id="customer-list-title" className="sr-only">{t("listTitle")}</h2>
        <FilterBar>
          <SearchInput label={t("search")} defaultValue={q} />
          <FilterButton>{(await getTranslations("Common"))("filter")}</FilterButton>
          {q && <Link href="/admin/customer-accounts" className="flex h-9 items-center px-2 text-sm text-muted-foreground underline underline-offset-4">{t("clearSearch")}</Link>}
        </FilterBar>
        <p className="text-xs text-muted-foreground">{t("resultCount", { count: accounts.length })}</p>
        <DataTable
          stack
          empty={t("empty")}
          numeric={[2]}
          head={[t("name"), t("method"), t("orders"), t("createdAt"), t("status"), t("actions")]}
        >
          {accounts.map((a) => {
            const hasPassword = a.providers.includes("credential");
            return (
              <tr key={a.id} data-testid="customer-row">
                <Td className="md:min-w-56 md:py-4">
                  <div className="flex items-start gap-3">
                    <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 font-semibold text-primary">
                      {Array.from(a.name.trim())[0]?.toUpperCase() ?? "?"}
                    </span>
                    <div className="min-w-0 space-y-1">
                      <div className="font-medium break-words">{a.name}</div>
                      {a.phoneNumber && <div className="flex items-start gap-1.5 text-xs text-muted-foreground"><Phone className="mt-0.5 size-3 shrink-0" aria-hidden /><span className="font-mono">{a.phoneNumber}</span></div>}
                      {!isPhoneEmail(a.email) && <div className="flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground"><Mail className="mt-0.5 size-3 shrink-0" aria-hidden /><span className="min-w-0 truncate" title={a.email}>{a.email}</span></div>}
                    </div>
                  </div>
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
                <Td className="md:w-64 md:min-w-64">
                  <div className="flex w-full flex-wrap items-start gap-2">
                    {hasPassword && (
                      <details className="group/password min-w-0 open:w-full" data-testid="customer-password-panel">
                        <summary className={cn(buttonVariants({ variant: "outline", size: "lg" }), "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
                          <KeyRound aria-hidden />{t("passwordOptions")}
                          <ChevronDown className="transition-transform group-open/password:rotate-180" aria-hidden />
                        </summary>
                        <div className="mt-3 max-w-sm space-y-3 rounded-xl border bg-muted/30 p-3">
                          <p className="text-xs leading-relaxed text-muted-foreground">{t("passwordHint")}</p>
                          <ActionForm action={resetCustomerPasswordAction} submitLabel={t("resetPassword")} variant="outline" className="space-y-3">
                            <input type="hidden" name="id" value={a.id} />
                            <label className="grid gap-1.5 text-xs font-medium">
                              {t("tempPassword", { min: MIN_CUSTOMER_PASSWORD })}
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
                            </label>
                          </ActionForm>
                        </div>
                      </details>
                    )}
                    <ActionForm
                      action={setCustomerActiveAction}
                      submitLabel={a.active ? t("lock") : t("unlock")}
                      variant={a.active ? "destructive" : "outline"}
                      confirm={a.active ? t("lockConfirm", { name: a.name }) : undefined}
                      className="space-y-1"
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
      </section>
      <details className="group/help rounded-xl border bg-muted/30 p-4">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <Info className="size-4 text-muted-foreground" aria-hidden />{t("helpTitle")}
          <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-open/help:rotate-180" aria-hidden />
        </summary>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">{t("hint")}</p>
      </details>
    </Page>
  );
}
