import type { Metadata } from "next";
import { Suspense } from "react";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import type { StoreLocale } from "@/i18n/routing";
import { formatMmk } from "@/lib/money";
import { addressCatalog } from "@/server/locations/cached";
import { listAddresses } from "@/server/accounts/accounts";
import { requireCustomer } from "@/server/auth/customer-session";
import { CART_COOKIE, parseCart } from "@/server/cart/cart";
import { getCartDetails } from "@/server/catalog/store-queries";
import { getBoolSetting } from "@/server/settings";
import { CheckoutForm } from "@/components/store/checkout-form";
import { ContactLinks } from "@/components/store/contact-links";
import { BlockSkeleton, Notice, PageTitle } from "@/components/store/ui";

/** Thanh toán: không cho máy tìm kiếm index (SEO, P7). */
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function CheckoutPage(props: PageProps<"/[locale]/checkout">) {
  return (
    <Suspense fallback={<BlockSkeleton />}>
      <CheckoutContent {...props} />
    </Suspense>
  );
}

/** Đặt hàng bắt buộc có tài khoản khách (P14c) — proxy đã chuyển trang đăng nhập khi chưa có cookie phiên. */
async function CheckoutContent({ params }: PageProps<"/[locale]/checkout">) {
  const { locale } = (await params) as { locale: StoreLocale };
  setRequestLocale(locale);
  const user = await requireCustomer(locale, "/checkout");
  const lines = parseCart((await cookies()).get(CART_COOKIE)?.value);
  const [t, ta, cart, catalog, checkoutEnabled, addresses] = await Promise.all([
    getTranslations({ locale, namespace: "Checkout" }),
    getTranslations({ locale, namespace: "Address" }),
    getCartDetails(lines, locale),
    addressCatalog(locale),
    getBoolSetting("store.checkoutEnabled"),
    listAddresses(user.id),
  ]);
  if (!cart.ok) redirect({ href: "/cart", locale });

  const saved = addresses.map((a) => ({
    id: a.id,
    label: [a.recipientName, a.phone, a.line].join(" · "),
    recipientName: a.recipientName,
    phone: a.phone,
    phone2: a.phone2,
    townshipId: a.townshipId,
    line: a.line,
    note: a.note,
  }));

  return (
    <div className="space-y-4 lg:grid lg:grid-cols-[1fr_22rem] lg:items-start lg:gap-6 lg:space-y-0">
      <div className="lg:col-span-2">
        <PageTitle>{t("title")}</PageTitle>
        <p className="-mt-2 text-sm text-muted-foreground" data-testid="ordering-as">
          {t("orderingAs", { email: user.contact })}
        </p>
        {user.affiliate && (
          <p className="mt-1 rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground" data-testid="ordering-as-affiliate">
            {t("orderingAsAffiliate", { code: user.affiliate.code })}
          </p>
        )}
      </div>
      <section
        aria-labelledby="sum-h"
        className="rounded-xl border border-border bg-card p-3 lg:sticky lg:top-36 lg:col-start-2 lg:row-start-2 lg:p-4"
      >
        <h2 id="sum-h" className="mb-2 font-medium">
          {t("summary")}
        </h2>
        <ul className="space-y-1 text-sm">
          {cart.lines.map((l) => (
            <li key={l.variantId} className="flex justify-between gap-3">
              <span>
                {l.name} · {l.label} × {l.qty}
                {l.preorder && <span className="text-xs text-muted-foreground"> · {t("preorderTag")}</span>}
              </span>
              <span className="whitespace-nowrap">{formatMmk(l.priceMmk * l.qty, locale)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 flex justify-between border-t border-border pt-2 font-medium">
          <span>{t("total")}</span>
          <span>{formatMmk(cart.subtotalMmk, locale)}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground" data-testid="shipping-note">
          {ta("shippingNote")}
        </p>
        {cart.preorder && (
          <Notice className="mt-2" data-testid="checkout-preorder">
            {t("preorderNotice")}
          </Notice>
        )}
      </section>
      <div className="lg:col-start-1 lg:row-start-2 lg:rounded-xl lg:bg-card lg:p-4 lg:ring-1 lg:ring-border">
        {checkoutEnabled ? (
          <CheckoutForm
            locale={locale}
            catalog={catalog}
            idempotencyKey={randomUUID()}
            addresses={saved}
            accountName={user.name}
            accountPhone={user.phone}
            summary={<div className="space-y-2 rounded-lg bg-accent p-3 text-sm"><p className="flex justify-between font-medium"><span>{t("total")}</span><span>{formatMmk(cart.subtotalMmk, locale)}</span></p><p>{ta("shippingNote")}</p><p>{t("paymentReminder")}</p><ContactLinks locale={locale} /></div>}
          />
        ) : (
          <p role="alert" className="rounded-lg border border-border bg-card p-3 text-sm">
            {t("err.checkout_disabled")}
          </p>
        )}
      </div>
    </div>
  );
}
