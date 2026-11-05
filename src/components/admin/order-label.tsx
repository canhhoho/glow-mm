import { getTranslations } from "next-intl/server";
import { fmtDateTime, fmtInt } from "@/lib/format";
import { BRAND_NAME } from "@/lib/brand";

export type OrderLabelData = {
  code: string;
  recipientName: string;
  recipientPhone: string;
  recipientPhone2: string | null;
  addressText: string;
  zoneName: string;
  paymentMethod: string;
  paymentStatus: string;
  shippingPayer?: "RECEIVER" | "SENDER";
  totalMmk: number;
  shippingFeeMmk: number;
  note: string | null;
  createdAt: Date;
  items: { qty: number }[];
  deliveries: { trackingNo: string | null }[];
};

/** Nhãn ship khổ A6 — dùng chung cho in một đơn và in hàng loạt (mỗi nhãn một trang). */
export async function OrderLabel({ order, className }: { order: OrderLabelData; className?: string }) {
  const t = await getTranslations("Orders");
  const collect = order.paymentMethod === "COD" && order.paymentStatus !== "PAID";
  const tracking = order.deliveries[0]?.trackingNo;
  const itemCount = order.items.reduce((s, i) => s + i.qty, 0);
  return (
    <article
      data-testid="order-label"
      className={`mx-auto max-w-[105mm] space-y-3 rounded-lg border-2 border-foreground p-4 text-sm print:max-w-none print:rounded-none ${className ?? ""}`}
    >
      <header className="flex items-baseline justify-between border-b pb-2">
        <span className="text-lg font-bold">{BRAND_NAME}</span>
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
        {order.shippingPayer === "SENDER" ? <div className="text-sm font-bold">{t("senderPays")}</div> : order.shippingFeeMmk === 0 && <div className="text-xs">{t("shippingNote")}</div>}
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
  );
}
