import { Suspense } from "react";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import type { StoreLocale } from "@/i18n/routing";
import { formatMmk } from "@/lib/money";
import { CART_COOKIE, parseCart } from "@/server/cart/cart";
import { getCartDetails, storeShippingZones } from "@/server/catalog/store-queries";
import { getBoolSetting } from "@/server/settings";
import { CheckoutForm } from "@/components/store/checkout-form";
import { BlockSkeleton, PageTitle } from "@/components/store/ui";

export default function CheckoutPage(props: PageProps<"/[locale]/checkout">) {
  return (
    <Suspense fallback={<BlockSkeleton />}>
      <CheckoutContent {...props} />
    </Suspense>
  );
}

async function CheckoutContent({ params }: PageProps<"/[locale]/checkout">) {
  const { locale } = (await params) as { locale: StoreLocale };
  setRequestLocale(locale);
  const lines = parseCart((await cookies()).get(CART_COOKIE)?.value);
  const [t, cart, zones, checkoutEnabled] = await Promise.all([
    getTranslations({ locale, namespace: "Checkout" }),
    getCartDetails(lines, locale),
    storeShippingZones(locale),
    getBoolSetting("store.checkoutEnabled"),
  ]);
  if (!cart.ok) redirect({ href: "/cart", locale });

  const zoneOptions = zones.map((z) => ({
    id: z.id,
    label: `${z.name} — ${
      z.freeFromMmk != null
        ? t("shippingByZone", { fee: formatMmk(z.feeMmk, locale), free: formatMmk(z.freeFromMmk, locale) })
        : formatMmk(z.feeMmk, locale)
    }`,
  }));

  return (
    <div className="space-y-4 lg:grid lg:grid-cols-[1fr_22rem] lg:items-start lg:gap-6 lg:space-y-0">
      <div className="lg:col-span-2">
        <PageTitle>{t("title")}</PageTitle>
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
              </span>
              <span className="whitespace-nowrap">{formatMmk(l.priceMmk * l.qty, locale)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 flex justify-between border-t border-border pt-2 font-medium">
          <span>{t("total")}</span>
          <span>{formatMmk(cart.subtotalMmk, locale)}</span>
        </p>
      </section>
      <div className="lg:col-start-1 lg:row-start-2 lg:rounded-xl lg:bg-card lg:p-4 lg:ring-1 lg:ring-border">
        {checkoutEnabled ? (
          <CheckoutForm locale={locale} zones={zoneOptions} idempotencyKey={randomUUID()} />
        ) : (
          <p role="alert" className="rounded-lg border border-border bg-card p-3 text-sm">
            {t("err.checkout_disabled")}
          </p>
        )}
      </div>
    </div>
  );
}
