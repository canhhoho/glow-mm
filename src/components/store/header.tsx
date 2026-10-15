import { Suspense } from "react";
import { cookies } from "next/headers";
import { Search, ShoppingBag } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing, type StoreLocale } from "@/i18n/routing";
import { CART_COOKIE, cartCount, parseCart } from "@/server/cart/cart";

/** Số món trong giỏ (đọc cookie lúc request → nằm trong Suspense để header vẫn thuộc static shell). */
async function CartBadge() {
  const n = cartCount(parseCart((await cookies()).get(CART_COOKIE)?.value));
  if (n === 0) return null;
  return (
    <span
      className="absolute top-1 right-0.5 grid min-w-4 place-items-center rounded-full bg-card px-1 text-[10px] leading-4 text-brand"
      data-testid="cart-count"
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

export async function StoreHeader({ locale }: { locale: StoreLocale }) {
  const t = await getTranslations("Nav");
  const other = routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;

  return (
    <header className="sticky top-0 z-10 flex h-12 items-center justify-between bg-brand px-4 text-brand-foreground">
      <Link href="/" className="text-base font-medium">
        Glow VN
      </Link>
      <nav className="flex items-center gap-1">
        <Link
          href="/"
          locale={other}
          className="inline-flex h-8 items-center rounded px-2 text-xs whitespace-nowrap uppercase ring-1 ring-white/50"
          aria-label={t("language")}
        >
          {other === "my" ? "မြန်မာ" : "EN"}
        </Link>
        <Link href="/search" aria-label={t("search")} className="grid size-11 place-items-center">
          <Search className="size-5" aria-hidden />
        </Link>
        <Link href="/cart" aria-label={t("cart")} className="relative grid size-11 place-items-center">
          <ShoppingBag className="size-5" aria-hidden />
          <Suspense>
            <CartBadge />
          </Suspense>
        </Link>
      </nav>
    </header>
  );
}
