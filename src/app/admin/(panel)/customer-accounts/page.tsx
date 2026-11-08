import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ChevronDown, Info, Mail, Phone } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/session";
import { isPhoneEmail } from "@/server/auth/customer-policy";
import { listCustomerAccounts } from "@/server/accounts/admin";
import { deleteCustomerAccountAction, setCustomerActiveAction } from "@/server/accounts/actions";
import { AccountRowActions } from "@/components/admin/account-row-actions";
import { Badge, DataTable, FilterBar, FilterButton, Page, PageHeader, SearchInput, Stat, Td } from "@/components/admin/ui";

/**
 * Tài khoản khách storefront (P17): tìm theo SĐT / email / tên; mỗi dòng Sửa (tên, SĐT, mật khẩu tạm ở trang
 * `/admin/customer-accounts/[id]`) · Khoá/Mở khoá · Xoá (chỉ tài khoản chưa có đơn).
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
                <Td className="align-middle md:w-px md:whitespace-nowrap">
                  <AccountRowActions
                    editHref={`/admin/customer-accounts/${a.id}`}
                    editLabel={t("edit")}
                    lock={{
                      action: setCustomerActiveAction,
                      fields: { id: a.id, active: String(!a.active) },
                      active: a.active,
                      lockLabel: t("lock"),
                      unlockLabel: t("unlock"),
                      confirm: t("lockConfirm", { name: a.name }),
                    }}
                    remove={
                      a._count.orders === 0
                        ? { action: deleteCustomerAccountAction, fields: { id: a.id }, label: t("delete"), confirm: t("deleteConfirm", { name: a.name }) }
                        : undefined
                    }
                  />
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
