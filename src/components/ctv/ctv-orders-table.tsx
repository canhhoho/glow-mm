import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { fmtDate, fmtInt } from "@/lib/format";
import type { AffiliateOrder } from "@/server/affiliates/affiliates";
import { CommissionBadge } from "@/components/admin/affiliate-parts";
import { OrderStatusBadge } from "@/components/admin/order-badges";
import { DataTable, Td } from "@/components/admin/ui";

/**
 * Bảng đơn của cổng CTV (Tổng quan + Đơn của tôi) theo chuẩn bảng admin (18/11/2026): `DataTable stack` — điện thoại
 * mỗi đơn một thẻ "nhãn: giá trị", máy tính dạng bảng. Mã đơn là link sang chi tiết.
 */
export async function CtvOrdersTable({ orders, empty }: { orders: AffiliateOrder[]; empty: string }) {
  const ta = await getTranslations("Affiliates");
  return (
    <DataTable
      stack
      empty={empty}
      numeric={[3, 5]}
      head={[ta("colOrder"), ta("colCustomer"), ta("colDate"), ta("colGoods"), ta("colSource"), ta("colCommission")]}
    >
      {orders.map((o) => (
        <tr key={o.id} data-testid="ctv-order">
          <Td>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/ctv/orders/${o.id}`} className="font-mono text-sm text-primary underline">
                {o.code}
              </Link>
              <OrderStatusBadge status={o.status} />
            </div>
          </Td>
          <Td label={ta("colCustomer")}>
            {o.recipientName}
            <div className="font-mono text-xs text-muted-foreground">{o.recipientPhone}</div>
          </Td>
          <Td label={ta("colDate")} className="whitespace-nowrap">{fmtDate(o.createdAt)}</Td>
          <Td label={ta("colGoods")} numeric>{fmtInt(o.totalMmk)}</Td>
          <Td label={ta("colSource")} className="text-xs">{o.affiliateSource && ta(`source.${o.affiliateSource}`)}</Td>
          <Td label={ta("colCommission")} numeric>
            <div className="flex flex-col items-end gap-1 max-md:flex-row max-md:items-center">
              <span className="font-medium">+{fmtInt(o.commission.commissionMmk)}</span>
              <CommissionBadge state={o.commission.state} />
            </div>
          </Td>
        </tr>
      ))}
    </DataTable>
  );
}
