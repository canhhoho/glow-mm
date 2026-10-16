import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import type { StoreLocale } from "@/i18n/routing";
import { fmtDateTime } from "@/lib/format";
import { formatMmk } from "@/lib/money";
import { ORDERS_COOKIE, parseOrderAccess } from "@/server/cart/cart";
import { findOrderForCustomer } from "@/server/orders/orders";
import { reviewablesForOrder } from "@/server/reviews/reviews";
import { getStringSetting } from "@/server/settings";
import { ContactLinks } from "@/components/store/contact-links";
import { ProofForm } from "@/components/store/proof-form";
import { ReviewForm } from "@/components/store/review-form";
import { BlockSkeleton, Notice } from "@/components/store/ui";

/** Đơn của khách (riêng tư): không cho máy tìm kiếm index (SEO, P7). */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function OrderPage(props: PageProps<"/[locale]/order/[code]">) {
  return (
    <Suspense fallback={<BlockSkeleton />}>
      <OrderContent {...props} />
    </Suspense>
  );
}

/** Trang đơn của khách: chỉ mở được khi trình duyệt đã đặt/tra cứu đơn này (cookie mã đơn + SĐT). */
async function OrderContent({ params, searchParams }: PageProps<"/[locale]/order/[code]">) {
  const { locale, code } = (await params) as { locale: StoreLocale; code: string };
  setRequestLocale(locale);
  const { placed } = await searchParams;
  const access = parseOrderAccess((await cookies()).get(ORDERS_COOKIE)?.value).find((a) => a.c === code);
  const order = access ? await findOrderForCustomer(code, access.p) : null;
  if (!order) return redirect({ href: { pathname: "/track", query: { code } }, locale });

  const [t, tr, bankInstructions, reviewables] = await Promise.all([
    getTranslations({ locale, namespace: "Order" }),
    getTranslations({ locale, namespace: "Review" }),
    order.paymentMethod === "BANK_TRANSFER" ? getStringSetting("payment.bankInstructions") : "",
    order.status === "COMPLETED" ? reviewablesForOrder(order.id) : [],
  ]);
  const total = formatMmk(order.totalMmk, locale);
  const awaitingProof =
    order.paymentMethod === "BANK_TRANSFER" &&
    order.status === "PENDING" &&
    (order.paymentStatus === "UNPAID" || order.paymentStatus === "REJECTED");
  const holdUntil = order.reservations[0]?.expiresAt;
  const delivery = order.deliveries[0];

  return (
    <div className="mx-auto max-w-screen-md space-y-4">
      {placed && <Notice tone="success">{t("thanks")}</Notice>}
      <section className="rounded-xl bg-accent p-4 text-accent-foreground">
        <p className="text-sm">{t("code")}</p>
        <p className="font-mono text-xl font-medium" data-testid="order-code">
          {order.code}
        </p>
        <p className="text-xs">{t("keepCode")}</p>
      </section>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{t("status")}</dt>
        <dd className="font-medium" data-testid="order-status">
          {t(`st.${order.status}`)}
        </dd>
        <dt className="text-muted-foreground">{t("payment")}</dt>
        <dd>{t(`pay.${order.paymentStatus}`)}</dd>
        <dt className="text-muted-foreground">{t("deliverTo")}</dt>
        <dd>
          {order.recipientName} · {order.recipientPhone}
          <br />
          {order.addressText}
          <br />
          {order.zoneName}
        </dd>
        {delivery && (
          <>
            <dt className="text-muted-foreground">{t("tracking")}</dt>
            <dd>
              {delivery.carrier} · <span className="font-mono">{delivery.trackingNo ?? "—"}</span>
            </dd>
          </>
        )}
      </dl>

      {order.status === "PENDING" && order.paymentMethod === "COD" && <Notice>{t("codInfo", { total })}</Notice>}

      {awaitingProof && (
        <section className="space-y-3 rounded-lg border border-border bg-card p-3">
          {order.paymentStatus === "REJECTED" && <Notice tone="error">{t("rejected")}</Notice>}
          <p className="text-sm">{t("bankInfo", { total })}</p>
          <p className="rounded-md bg-muted p-2 text-sm whitespace-pre-line" data-testid="bank-instructions">
            {bankInstructions}
          </p>
          <p className="text-sm">{t("bankRef", { code: order.code })}</p>
          {holdUntil && <p className="text-xs text-muted-foreground">{t("holdUntil", { time: fmtDateTime(holdUntil) })}</p>}
          <ProofForm locale={locale} code={order.code} />
        </section>
      )}
      {order.paymentStatus === "PROOF_SUBMITTED" && <Notice tone="success">{t("uploaded")}</Notice>}

      <section aria-labelledby="items-h">
        <h2 id="items-h" className="mb-2 font-medium">
          {t("items")}
        </h2>
        <ul className="space-y-1 text-sm">
          {order.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3">
              <span>
                {i.name} × {i.qty}
              </span>
              <span className="whitespace-nowrap">{formatMmk(i.qty * i.unitPriceMmk, locale)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-2 grid grid-cols-[1fr_auto] gap-y-1 border-t border-border pt-2 text-sm">
          <dt>{t("subtotal")}</dt>
          <dd className="text-right">{formatMmk(order.subtotalMmk, locale)}</dd>
          <dt>{t("shipping")}</dt>
          <dd className="text-right">{order.shippingFeeMmk === 0 ? t("free") : formatMmk(order.shippingFeeMmk, locale)}</dd>
          <dt className="font-medium">{t("total")}</dt>
          <dd className="text-right font-medium" data-testid="order-total">
            {total}
          </dd>
        </dl>
      </section>

      {reviewables.length > 0 && (
        <section aria-labelledby="review-h" className="space-y-2">
          <h2 id="review-h" className="font-medium">
            {tr("title")}
          </h2>
          {reviewables.map((r) =>
            r.review ? (
              <p key={r.productId} className="text-sm" data-testid="review-status">
                {r.name}: {"★".repeat(r.review.rating)} —{" "}
                {r.review.status === "PENDING" ? tr("pending") : r.review.status === "APPROVED" ? tr("approved") : tr("rejected")}
              </p>
            ) : (
              <ReviewForm key={r.productId} locale={locale} code={order.code} productId={r.productId} name={r.name} />
            ),
          )}
        </section>
      )}

      <section className="space-y-2">
        <p className="text-sm text-muted-foreground">{t("askHelp")}</p>
        <ContactLinks locale={locale} />
      </section>
    </div>
  );
}
