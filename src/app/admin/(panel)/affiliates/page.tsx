import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { fmtInt } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/session";
import { bpToPercent } from "@/server/affiliates/commission";
import { listAffiliates } from "@/server/affiliates/affiliates";
import { pendingApplicationsCount } from "@/server/affiliates/applications";
import { deleteAffiliateAction, setAffiliateActiveAction } from "@/server/affiliates/actions";
import { AccountRowActions } from "@/components/admin/account-row-actions";
import { Badge, DataTable, fieldClass, FilterBar, FilterButton, LinkButton, Page, PageHeader, SearchInput, Td } from "@/components/admin/ui";

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");

export default async function AffiliatesPage({ searchParams }: PageProps<"/admin/affiliates">) {
  await requirePagePermission("affiliates:manage");
  const sp = await searchParams;
  const q = str(sp.q);
  const status = str(sp.status);
  const active = status === "active" ? true : status === "locked" ? false : undefined;
  const [t, affiliates, pendingApps] = await Promise.all([
    getTranslations("Affiliates"),
    listAffiliates({ q: q || undefined, active }),
    pendingApplicationsCount(),
  ]);

  return (
    <Page>
      <PageHeader
        title={t("title")}
        actions={
          <>
            <LinkButton href="/admin/affiliates/applications">
              {t("apps.title")}
              {pendingApps > 0 && (
                <span className="ml-1.5" data-testid="pending-apps">
                  <Badge tone="brand">{pendingApps}</Badge>
                </span>
              )}
            </LinkButton>
            <LinkButton href="/admin/affiliates/new" variant="primary" icon="new">
              {t("new")}
            </LinkButton>
          </>
        }
      />
      <FilterBar>
        <SearchInput label={t("search")} defaultValue={q} />
        <select name="status" defaultValue={status} aria-label={t("status")} className={fieldClass}>
          <option value="">
            {t("status")}: {t("all")}
          </option>
          <option value="active">{t("active")}</option>
          <option value="locked">{t("locked")}</option>
        </select>
        <FilterButton>{t("filter")}</FilterButton>
      </FilterBar>
      <DataTable
        stack
        empty={active === undefined ? t("empty") : t("emptyFiltered")}
        head={[t("colCtv"), t("colCode"), t("colPercent"), t("colMonthSales"), t("colPending"), t("colPayable"), t("colPaid"), <span key="actions" className="block md:text-right">{t("actions")}</span>]}
        numeric={[3, 4, 5, 6]}
      >
        {affiliates.map((a) => (
          <tr key={a.id} data-testid="affiliate-row">
            <Td>
              <Link href={`/admin/affiliates/${a.id}`} className="text-primary underline">
                {a.user.name}
              </Link>
              <div className="font-mono text-xs text-muted-foreground">{a.phone}</div>
              {!a.active && <Badge tone="danger">{t("locked")}</Badge>}
            </Td>
            <Td label={t("colCode")} className="font-mono text-xs">{a.code}</Td>
            <Td label={t("colPercent")} className="tabular-nums">
              {bpToPercent(a.commissionRateBp)}%
              {a.uplineRateBp != null && (
                <div className="text-xs text-muted-foreground">{t("uplineShort", { percent: bpToPercent(a.uplineRateBp) })}</div>
              )}
            </Td>
            <Td label={t("colMonthSales")} className="text-right tabular-nums whitespace-nowrap">
              {fmtInt(a.summary.monthSalesMmk)}
              <div className="text-xs text-muted-foreground">{t("ordersCount", { count: a.summary.monthOrders })}</div>
            </Td>
            <Td label={t("colPending")} className="text-right tabular-nums">{fmtInt(a.summary.pendingMmk)}</Td>
            <Td label={t("colPayable")} className="text-right font-medium tabular-nums">{fmtInt(a.summary.payableMmk)}</Td>
            <Td label={t("colPaid")} className="text-right tabular-nums">{fmtInt(a.summary.paidMmk)}</Td>
            <Td label={t("actions")} className="align-middle md:w-px md:whitespace-nowrap">
              <AccountRowActions
                editHref={`/admin/affiliates/${a.id}#profile`}
                editLabel={t("edit")}
                lock={{
                  action: setAffiliateActiveAction,
                  fields: { id: a.id, active: String(!a.active) },
                  active: a.active,
                  lockLabel: t("lock"),
                  unlockLabel: t("unlock"),
                  confirm: t("lockConfirm", { name: a.user.name }),
                }}
                remove={{ action: deleteAffiliateAction, fields: { id: a.id }, label: t("delete"), confirm: t("deleteConfirm", { name: a.user.name }) }}
              />
            </Td>
          </tr>
        ))}
      </DataTable>
    </Page>
  );
}
