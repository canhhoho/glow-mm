import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/auth/roles";
import { affiliateOptions } from "@/server/affiliates/affiliates";
import { listOrdersAdmin } from "@/server/orders/admin-queries";
import { ORDER_STATUSES } from "@/server/orders/state-machine";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/admin/order-badges";
import { Badge, DataTable, fieldClass, LinkButton, PageHeader, Td } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { fmtDate, fmtInt } from "@/lib/format";

const CHANNELS = ["WEB", "FACEBOOK", "VIBER", "PHONE"] as const;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function OrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  const user = await requirePagePermission("orders:view");
  const sp = await searchParams;
  const filter = {
    status: str(sp.status),
    channel: str(sp.channel),
    q: str(sp.q),
    overdue: sp.overdue === "1",
    affiliateId: str(sp.affiliate),
  };
  const [t, orders, affiliates] = await Promise.all([getTranslations("Orders"), listOrdersAdmin(filter), affiliateOptions()]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("title")}
        actions={
          can(user.role, "orders:create") && (
            <LinkButton href="/admin/orders/new" variant="primary">
              + {t("new")}
            </LinkButton>
          )
        }
      />
      <form role="search" className="flex flex-wrap items-center gap-2">
        <input name="q" defaultValue={filter.q} placeholder={t("search")} className={`${fieldClass} max-w-60`} />
        <select name="status" defaultValue={filter.status ?? ""} aria-label={t("colStatus")} className={`${fieldClass} w-auto`}>
          <option value="">{t("allStatuses")}</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </select>
        <select name="channel" defaultValue={filter.channel ?? ""} aria-label={t("colChannel")} className={`${fieldClass} w-auto`}>
          <option value="">{t("allChannels")}</option>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {t(`channel.${c}`)}
            </option>
          ))}
        </select>
        {affiliates.length > 0 && (
          <select name="affiliate" defaultValue={filter.affiliateId ?? ""} aria-label={t("colAffiliate")} className={`${fieldClass} w-auto`}>
            <option value="">{t("allAffiliates")}</option>
            {affiliates.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="overdue" value="1" defaultChecked={filter.overdue} />
          {t("overdueOnly")}
        </label>
        <Button type="submit" variant="outline">
          {t("filter")}
        </Button>
      </form>

      <DataTable
        empty={t("empty")}
        head={[t("colCode"), t("colCreated"), t("colCustomer"), t("colChannel"), t("colPayment"), t("colTotal"), t("colStatus")]}
      >
        {orders.map((o) => (
          <tr key={o.id}>
            <Td>
              <Link href={`/admin/orders/${o.id}`} className="font-mono text-xs text-primary underline">
                {o.code}
              </Link>
              <div className="text-xs text-muted-foreground">
                {o._count.items} {t("colItems")}
              </div>
            </Td>
            <Td className="whitespace-nowrap">{fmtDate(o.createdAt)}</Td>
            <Td>
              {o.recipientName}
              <div className="font-mono text-xs text-muted-foreground">{o.recipientPhone}</div>
            </Td>
            <Td>
              {t(`channel.${o.channel}`)}
              {o.affiliate && (
                <div className="font-mono text-xs text-muted-foreground" title={t("colAffiliate")}>
                  {t("colAffiliate")}: {o.affiliate.code}
                </div>
              )}
            </Td>
            <Td>
              <div className="flex flex-col items-start gap-1">
                <span className="text-xs">{t(`method.${o.paymentMethod}`)}</span>
                <PaymentStatusBadge status={o.paymentStatus} />
              </div>
            </Td>
            <Td className="text-right tabular-nums whitespace-nowrap">{fmtInt(o.totalMmk)} MMK</Td>
            <Td>
              <div className="flex flex-col items-start gap-1">
                <OrderStatusBadge status={o.status} />
                {o.overdue && <Badge tone="danger">{t("overdue")}</Badge>}
              </div>
            </Td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}
