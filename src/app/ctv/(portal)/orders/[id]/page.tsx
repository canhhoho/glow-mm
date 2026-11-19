import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { fmtDateTime, fmtInt } from "@/lib/format";
import { siteUrl } from "@/lib/site";
import { requireAffiliate } from "@/server/auth/session";
import { bpToPercent, hasFixedCommission } from "@/server/affiliates/commission";
import { getAffiliateOrder } from "@/server/affiliates/affiliates";
import { CommissionBadge } from "@/components/admin/affiliate-parts";
import { OrderStatusBadge } from "@/components/admin/order-badges";
import { DataTable, Page, PageHeader, Section, Td } from "@/components/admin/ui";
import { Notice } from "@/components/ui/notice";
import { CopyLink } from "@/components/ctv/copy-link";

/** Chi tiết đơn của CTV — Section + DataTable theo chuẩn admin (18/11/2026); không có giá vốn / lô. */
export default async function CtvOrderPage({ params, searchParams }: PageProps<"/ctv/orders/[id]">) {
  const user = await requireAffiliate();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [t, ta, to, order] = await Promise.all([
    getTranslations("Ctv"),
    getTranslations("Affiliates"),
    getTranslations("Orders"),
    getAffiliateOrder(user.affiliateId, id),
  ]);
  if (!order) notFound();
  // Link theo dõi gửi khách (Viber/Messenger): trang Tra cứu điền sẵn mã đơn, khách nhập SĐT nhận hàng để xem.
  const trackLink = `${siteUrl()}/track?code=${encodeURIComponent(order.code)}`;

  return (
    <Page>
      <PageHeader
        title={<span className="font-mono">{order.code}</span>}
        actions={
          <span data-testid="order-status">
            <OrderStatusBadge status={order.status} />
          </span>
        }
        description={t("orderHint")}
        back={{ href: "/ctv/orders", label: t("back") }}
      />
      {sp.created && <Notice tone="success">{t("orderCreated")}</Notice>}

      <Section title={t("trackLink")}>
        <CopyLink text={trackLink} testId="ctv-track-link" copy={t("copy")} copied={t("copied")} />
        <p className="text-xs text-muted-foreground">{t("trackHint")}</p>
      </Section>

      <Section>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 [&>dd]:min-w-0 [&>dd]:break-words">
            <dt className="text-muted-foreground">{t("customer")}</dt>
            <dd>{order.recipientName}</dd>
            <dt className="text-muted-foreground">{ta("phone")}</dt>
            <dd className="font-mono">
              {order.recipientPhone}
              {order.recipientPhone2 && <> · {order.recipientPhone2}</>}
            </dd>
            <dt className="text-muted-foreground">{t("address")}</dt>
            <dd>
              {order.addressText}
              <div className="text-xs text-muted-foreground">{order.zoneName}</div>
            </dd>
          </dl>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 [&>dd]:min-w-0 [&>dd]:break-words">
            <dt className="text-muted-foreground">{ta("colDate")}</dt>
            <dd>{fmtDateTime(order.createdAt)}</dd>
            <dt className="text-muted-foreground">{to("paymentMethod")}</dt>
            <dd>{to(`method.${order.paymentMethod}`)}</dd>
            <dt className="text-muted-foreground">{ta("colSource")}</dt>
            <dd>{order.affiliateSource && ta(`source.${order.affiliateSource}`)}</dd>
            <dt className="text-muted-foreground">{ta("colCommission")}</dt>
            <dd className="flex flex-wrap items-center gap-2" data-testid="ctv-order-commission">
              <span className="font-medium tabular-nums">{fmtInt(order.commission.commissionMmk)} MMK</span>
              <span className="text-xs text-muted-foreground">
                (
                {order.commissionRateBp != null
                  ? `${bpToPercent(order.commissionRateBp)}%${hasFixedCommission(order.items) ? ` · ${ta("fixedPerProduct")}` : ""}`
                  : ta("byPriceList")}
                )
              </span>
              <CommissionBadge state={order.commission.state} />
            </dd>
          </dl>
        </div>
      </Section>

      <Section title={t("items")}>
        <DataTable stack numeric={[1, 2, 3]} head={[t("items"), t("qty"), t("price"), t("lineTotal")]}>
          {order.items.map((i) => (
            <tr key={i.id}>
              <Td>
                {i.name}
                <div className="font-mono text-xs text-muted-foreground">{i.sku}</div>
                {i.returnedQty > 0 && <div className="text-xs text-destructive">{t("returned", { qty: i.returnedQty })}</div>}
              </Td>
              <Td label={t("qty")} numeric>{i.qty}</Td>
              <Td label={t("price")} numeric>{fmtInt(i.unitPriceMmk)}</Td>
              <Td label={t("lineTotal")} numeric>{fmtInt(i.qty * i.unitPriceMmk)}</Td>
            </tr>
          ))}
        </DataTable>
        <dl className="ml-auto grid max-w-xs grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
          <dt>{t("subtotal")}</dt>
          <dd className="text-right tabular-nums">{fmtInt(order.subtotalMmk)} MMK</dd>
          {order.shippingFeeMmk > 0 && (
            <>
              <dt>{t("shipping")}</dt>
              <dd className="text-right tabular-nums">{fmtInt(order.shippingFeeMmk)} MMK</dd>
            </>
          )}
          <dt className="font-medium">{t("total")}</dt>
          <dd className="text-right font-medium tabular-nums">{fmtInt(order.totalMmk)} MMK</dd>
          {order.shippingFeeMmk === 0 && <dd className="col-span-2 text-xs text-muted-foreground">{to("shippingNote")}</dd>}
        </dl>
      </Section>

      <Section title={t("history")}>
        <ol className="space-y-1 text-sm">
          {order.history.map((h, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-36 shrink-0 text-xs text-muted-foreground">{fmtDateTime(h.createdAt)}</span>
              <span>{to(`status.${h.toStatus}`)}</span>
            </li>
          ))}
        </ol>
      </Section>
    </Page>
  );
}
