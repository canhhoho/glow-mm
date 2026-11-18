import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { fmtDateTime, fmtInt } from "@/lib/format";
import { requireAffiliate } from "@/server/auth/session";
import { bpToPercent, hasFixedCommission } from "@/server/affiliates/commission";
import { getAffiliateOrder } from "@/server/affiliates/affiliates";
import { CommissionBadge } from "@/components/admin/affiliate-parts";
import { OrderStatusBadge } from "@/components/admin/order-badges";
import { Notice } from "@/components/ui/notice";
import { storeCard, storeListCard } from "@/components/store/ui";
import { cn } from "@/lib/utils";

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

  return (
    <div className="space-y-4">
      <Link href="/ctv/orders" className="text-sm text-brand underline">
        {t("back")}
      </Link>
      {sp.created && (
        <Notice tone="success">{t("orderCreated")}</Notice>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-mono text-xl font-semibold">{order.code}</h1>
        <span data-testid="order-status">
          <OrderStatusBadge status={order.status} />
        </span>
      </div>
      <p className="text-sm text-muted-foreground">{t("orderHint")}</p>

      <section className={cn(storeCard, "grid gap-3 text-sm sm:grid-cols-2")}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
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
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
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
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">{t("items")}</h2>
        <ul className={cn(storeListCard, "text-sm")}>
          {order.items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-baseline justify-between gap-2 p-3">
              <span className="min-w-0 flex-1">
                {i.name}
                <span className="ml-1 font-mono text-xs text-muted-foreground">{i.sku}</span>
                {i.returnedQty > 0 && <span className="ml-1 text-xs text-destructive">({t("returned", { qty: i.returnedQty })})</span>}
              </span>
              <span className="tabular-nums">
                {i.qty} × {fmtInt(i.unitPriceMmk)} = {fmtInt(i.qty * i.unitPriceMmk)}
              </span>
            </li>
          ))}
        </ul>
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
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">{t("history")}</h2>
        <ol className="space-y-1 text-sm">
          {order.history.map((h, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-36 shrink-0 text-xs text-muted-foreground">{fmtDateTime(h.createdAt)}</span>
              <span>{to(`status.${h.toStatus}`)}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
