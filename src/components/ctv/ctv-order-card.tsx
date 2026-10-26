import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { fmtDate, fmtInt } from "@/lib/format";
import type { AffiliateOrder } from "@/server/affiliates/affiliates";
import { CommissionBadge } from "@/components/admin/affiliate-parts";
import { OrderStatusBadge } from "@/components/admin/order-badges";

/** Thẻ một đơn trong cổng CTV (tổng quan + đơn của tôi): mã, trạng thái, khách, tiền, hoa hồng. */
export async function CtvOrderCard({ order: o }: { order: AffiliateOrder }) {
  const ta = await getTranslations("Affiliates");
  return (
    <Link href={`/ctv/orders/${o.id}`} className="block rounded-2xl border bg-card p-3 shadow-sm hover:bg-muted">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-sm">{o.code}</span>
        <OrderStatusBadge status={o.status} />
      </div>
      <div className="mt-1 text-sm">
        {o.recipientName} · <span className="font-mono text-xs">{o.recipientPhone}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          {fmtDate(o.createdAt)} · {fmtInt(o.totalMmk)} MMK
          {o.affiliateSource && <> · {ta(`source.${o.affiliateSource}`)}</>}
        </span>
        <span className="flex items-center gap-2">
          <span className="font-medium tabular-nums">+{fmtInt(o.commission.commissionMmk)}</span>
          <CommissionBadge state={o.commission.state} />
        </span>
      </div>
    </Link>
  );
}
