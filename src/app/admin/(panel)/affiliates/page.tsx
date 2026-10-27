import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { fmtInt } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/session";
import { bpToPercent } from "@/server/affiliates/commission";
import { listAffiliates } from "@/server/affiliates/affiliates";
import { pendingApplicationsCount } from "@/server/affiliates/applications";
import { Badge, DataTable, fieldClass, LinkButton, PageHeader, Td } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";

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
    <div className="space-y-4">
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
            <LinkButton href="/admin/affiliates/new" variant="primary">
              + {t("new")}
            </LinkButton>
          </>
        }
      />
      <form className="flex flex-wrap items-end gap-2" role="search">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">{t("search")}</span>
          <input name="q" defaultValue={q} className={fieldClass} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">{t("status")}</span>
          <select name="status" defaultValue={status} className={fieldClass}>
            <option value="">{t("all")}</option>
            <option value="active">{t("active")}</option>
            <option value="locked">{t("locked")}</option>
          </select>
        </label>
        <Button type="submit" variant="outline">
          {t("filter")}
        </Button>
      </form>
      <DataTable
        empty={t("empty")}
        head={[t("colCtv"), t("colCode"), t("colPercent"), t("colMonthSales"), t("colPending"), t("colPayable"), t("colPaid")]}
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
            <Td className="font-mono text-xs">{a.code}</Td>
            <Td className="tabular-nums">
              {bpToPercent(a.commissionRateBp)}%
              {a.uplineRateBp != null && (
                <div className="text-xs text-muted-foreground">{t("uplineShort", { percent: bpToPercent(a.uplineRateBp) })}</div>
              )}
            </Td>
            <Td className="text-right tabular-nums whitespace-nowrap">
              {fmtInt(a.summary.monthSalesMmk)}
              <div className="text-xs text-muted-foreground">{t("ordersCount", { count: a.summary.monthOrders })}</div>
            </Td>
            <Td className="text-right tabular-nums">{fmtInt(a.summary.pendingMmk)}</Td>
            <Td className="text-right font-medium tabular-nums">{fmtInt(a.summary.payableMmk)}</Td>
            <Td className="text-right tabular-nums">{fmtInt(a.summary.paidMmk)}</Td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}
