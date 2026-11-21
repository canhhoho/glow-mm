import { Save, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { formatMmk } from "@/lib/money";
import { saveCartAction, setCartQtyAction } from "@/server/cart/actions";
import { CART_COOKIE, parseCart } from "@/server/cart/cart";
import { getCartDetails } from "@/server/catalog/store-queries";
import { BlockSkeleton, Notice, outlineButton, PageTitle, primaryButton, storeCard, storeField } from "@/components/store/ui";
import { buttonVariants } from "@/components/ui/button-variants";

/** Giỏ hàng: không cho máy tìm kiếm index (SEO, P7). */
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function CartPage(props: PageProps<"/[locale]/cart">) {
  return (
    <Suspense fallback={<BlockSkeleton />}>
      <CartContent {...props} />
    </Suspense>
  );
}

async function CartContent({ params }: PageProps<"/[locale]/cart">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const lines = parseCart((await cookies()).get(CART_COOKIE)?.value);
  const [t, ta, cart] = await Promise.all([
    getTranslations({ locale, namespace: "Cart" }),
    getTranslations({ locale, namespace: "Address" }),
    getCartDetails(lines, locale),
  ]);

  if (cart.lines.length === 0) {
    return (
      <div className={`${storeCard} mx-auto max-w-screen-md space-y-3`}>
        <PageTitle>{t("title")}</PageTitle>
        <p className="text-muted-foreground">{t("empty")}</p>
        <Link href="/" className={outlineButton}>
          {t("continue")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:grid lg:grid-cols-[1fr_20rem] lg:items-start lg:gap-6 lg:space-y-0">
      <div className="lg:col-span-2">
        <PageTitle>{t("title")}</PageTitle>
      </div>
      <ul className="space-y-3">
        {cart.lines.map((l) => (
          <li
            key={l.variantId}
            className={cn("space-y-2 rounded-lg border bg-card p-3", l.ok ? "border-border" : "border-destructive")}
            data-testid="cart-line"
          >
            <div className="flex justify-between gap-3">
              <Link href={`/p/${l.slug}`} className="text-sm">
                {l.name} {!l.standard && <span className="text-muted-foreground">· {l.label}</span>}
              </Link>
              <span className="font-medium whitespace-nowrap">{formatMmk(l.priceMmk * l.qty, locale)}</span>
            </div>
            {l.preorder && (
              <p className="text-xs text-secondary-foreground" data-testid="cart-preorder">
                {t("preorderLine")}
              </p>
            )}
            {!l.ok && (
              <p className="text-xs text-destructive">
                {l.preorderLimit > 0 && l.qty > l.available
                  ? t("preorderLimit", { count: l.preorderLimit })
                  : l.available <= 0
                    ? t("unavailable")
                    : t("onlyLeft", { count: l.available })}
              </p>
            )}
            <div className="flex items-center gap-2">
              {/* Ô số lượng thuộc form chung #cart-form (thuộc tính form=) để "Thanh toán" lưu hết số đang nhập. */}
              <input type="hidden" name="variantId" value={l.variantId} form="cart-form" />
              <input
                  form="cart-form"
                  name="qty"
                  type="number"
                  min={1}
                  max={99}
                  defaultValue={l.qty}
                  inputMode="numeric"
                  aria-label={l.standard ? l.name : `${l.name} ${l.label}`}
                  className={cn(storeField, "w-20")}
                />
              <form action={setCartQtyAction}>
                <input type="hidden" name="variantId" value={l.variantId} />
                <input type="hidden" name="qty" value="0" />
                <button type="submit" className={buttonVariants({ variant: "destructive", size: "icon-lg" })} title={t("remove")} aria-label={t("remove")}><Trash2 aria-hidden className="size-4 shrink-0" /></button>
              </form>
            </div>
          </li>
        ))}
      </ul>
      <aside className="space-y-4 lg:sticky lg:top-36 lg:rounded-xl lg:bg-card lg:p-4 lg:ring-1 lg:ring-border" data-testid="cart-summary">
        <div className="flex items-baseline justify-between text-base">
          <span>{t("subtotal")}</span>
          <span className="font-medium" data-testid="cart-subtotal">
            {formatMmk(cart.subtotalMmk, locale)}
          </span>
        </div>
        {/* Cùng câu với checkout: không tính ship trên đơn, hãng vận chuyển thu khi giao (P15). */}
        <p className="text-xs text-muted-foreground">{ta("shippingNote")}</p>
        {cart.ok && cart.preorder && <Notice>{t("preorderNotice")}</Notice>}
        {!cart.ok && <Notice tone="danger">{t("fix")}</Notice>}
        <form id="cart-form" action={saveCartAction} className="space-y-2">
          <input type="hidden" name="locale" value={locale} />
          {/* Nút đầu tiên = nút mặc định khi bấm Enter trong ô số lượng → chỉ lưu, không nhảy sang thanh toán. */}
          <button type="submit" className={cn(outlineButton, "w-full")}><Save aria-hidden className="size-4 shrink-0" /> {t("update")}</button>
          <button type="submit" name="intent" value="checkout" className={cn(primaryButton, "w-full")}>{t("checkout")}</button>
        </form>
      </aside>
    </div>
  );
}
