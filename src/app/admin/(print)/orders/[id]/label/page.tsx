import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { getOrderAdmin } from "@/server/orders/admin-queries";
import { PrintButton } from "@/components/admin/print-button";
import { LinkButton } from "@/components/admin/ui";
import { fmtDateTime, fmtInt } from "@/lib/format";

/** Nhãn ship khổ A6 (in từ trình duyệt). Nằm ngoài layout panel để bản in không có menu. */
export default async function OrderLabelPage({ params }: PageProps<"/admin/orders/[id]/label">) {
  await requirePagePermission("orders:view");
  const { id } = await params;
  const [t, order] = await Promise.all([getTranslations("Orders"), getOrderAdmin(id)]);
  if (!order) notFound();
  const collect = order.paymentMethod === "COD" && order.paymentStatus !== "PAID";
  const tracking = order.deliveries[0]?.trackingNo;
  const itemCount = order.items.reduce((s, i) => s + i.qty, 0);

  return (
    <div className="p-4 print:p-0">
      <style>{"@page { size: A6; margin: 6mm; }"}</style>
      <div className="mb-4 flex gap-2 print:hidden">
        <PrintButton label={t("print")} />
        <LinkButton href={`/admin/orders/${order.id}`}>← {order.code}</LinkButton>
      </div>
      <article className="mx-auto max-w-[105mm] space-y-3 rounded-lg border-2 border-foreground p-4 text-sm print:max-w-none print:rounded-none">
        <header className="flex items-baseline justify-between border-b pb-2">
          <span className="text-lg font-bold">Glow VN</span>
          <span className="font-mono text-base font-bold">{order.code}</span>
        </header>
        <section>
          <div className="text-xs text-muted-foreground">{t("recipient")}</div>
          <div className="text-lg font-bold">{order.recipientName}</div>
          <div className="font-mono text-lg">
            {order.recipientPhone}
            {order.recipientPhone2 && <span className="text-base"> / {order.recipientPhone2}</span>}
          </div>
          <div>{order.addressText}</div>
          <div className="font-medium">{order.zoneName}</div>
        </section>
        <section className="border-y py-2 text-center">
          {collect ? (
            <>
              <div className="text-xs">{t("codCollect")}</div>
              <div className="text-2xl font-bold tabular-nums">{fmtInt(order.totalMmk)} MMK</div>
            </>
          ) : (
            <div className="text-base font-bold">{t("prepaid")}</div>
          )}
          {order.shippingFeeMmk === 0 && <div className="text-xs">{t("shippingNote")}</div>}
        </section>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-xs">
          <dt>{t("itemsCount")}</dt>
          <dd>{itemCount}</dd>
          {tracking && (
            <>
              <dt>{t("trackingNo")}</dt>
              <dd className="font-mono">{tracking}</dd>
            </>
          )}
          {order.note && (
            <>
              <dt>{t("note")}</dt>
              <dd>{order.note}</dd>
            </>
          )}
          <dt>{t("colCreated")}</dt>
          <dd>{fmtDateTime(order.createdAt)}</dd>
        </dl>
      </article>
    </div>
  );
}
