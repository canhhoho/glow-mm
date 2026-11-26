import { Suspense } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { Languages, PackageSearch, Search, ShoppingBag, UserRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getPathname, Link } from "@/i18n/navigation";
import { routing, type StoreLocale } from "@/i18n/routing";
import { BRAND_NAME } from "@/lib/brand";
import { env } from "@/lib/env";
import { CART_COOKIE, cartCount, parseCart } from "@/server/cart/cart";
import { CategoryMenu } from "./category-menu";
import { CloseOnNavigate } from "./close-on-navigate";
import { HeaderSearchInput } from "./header-search-input";
import { LanguageSwitch } from "./language-switch";
import { storeField } from "./ui";

const langClass =
  "inline-flex min-h-8 cursor-pointer list-none items-center gap-1 rounded px-2 py-0.5 text-sm leading-[1.8] whitespace-nowrap text-brand-foreground ring-1 ring-white/50 [&::-webkit-details-marker]:hidden";
const langItem =
  "flex min-h-11 items-center px-4 text-sm leading-[1.8] hover:bg-accent aria-[current=true]:font-medium aria-[current=true]:text-primary";

/** Tên ngôn ngữ viết bằng chính ngôn ngữ đó (menu) + mã ngắn (nút). Thứ tự = `routing.locales`: my, en, vi. */
const LOCALE_NAMES: Record<StoreLocale, string> = { my: "မြန်မာ", en: "English", vi: "Tiếng Việt" };
const LOCALE_CODES: Record<StoreLocale, string> = { my: "MY", en: "EN", vi: "VI" };

/**
 * Menu ngôn ngữ (P22): <details> mở/đóng không cần JS; mỗi mục giữ trang đang xem khi đã tải JS
 * (fallback = trang chủ của ngôn ngữ đó). Tiếng Việt chỉ là lựa chọn thêm, xếp cuối.
 */
function LanguageMenu({ locale, label }: { locale: StoreLocale; label: string }) {
  return (
    <details className="relative col-start-3 row-start-1 justify-self-end" data-testid="language-menu">
      <summary className={langClass} aria-label={`${label}: ${LOCALE_NAMES[locale]}`} data-testid="language-switch">
        <Languages className="size-4" aria-hidden />
        {LOCALE_CODES[locale]}
      </summary>
      <Suspense>
        <CloseOnNavigate dismissible />
      </Suspense>
      <ul className="absolute top-full right-0 z-40 mt-1 min-w-40 overflow-hidden rounded-lg border border-border bg-card py-1 text-foreground shadow-lg">
        {routing.locales.map((l) => (
          <li key={l}>
            <Suspense
              fallback={
                <Link href="/" locale={l} lang={l} hrefLang={l} aria-current={l === locale ? "true" : undefined} className={langItem}>
                  {LOCALE_NAMES[l]}
                </Link>
              }
            >
              <LanguageSwitch to={l} name={LOCALE_NAMES[l]} current={l === locale} className={langItem} />
            </Suspense>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Số món trong giỏ (đọc cookie lúc request → nằm trong Suspense để header vẫn thuộc static shell). */
async function CartBadge() {
  const n = cartCount(parseCart((await cookies()).get(CART_COOKIE)?.value));
  if (n === 0) return null;
  return (
    <span
      className="absolute top-1 right-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-2xs leading-4 text-primary-foreground lg:bg-card lg:text-primary"
      data-testid="cart-count"
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

/** Liên hệ nhanh trên thanh phụ desktop (env đọc lúc request, như ChatFab). */
async function HeaderContact({ locale }: { locale: string }) {
  await connection();
  const { FB_PAGE_USERNAME, VIBER_CHAT_URI } = env();
  const t = await getTranslations({ locale, namespace: "Product" });
  const link = "inline-flex min-h-11 items-center hover:text-primary";
  return (
    <>
      {VIBER_CHAT_URI && (
        <a href={VIBER_CHAT_URI} className={link}>
          {t("askViber")}
        </a>
      )}
      {FB_PAGE_USERNAME && (
        <a href={`https://m.me/${encodeURIComponent(FB_PAGE_USERNAME)}`} target="_blank" rel="noreferrer" className={link}>
          {t("askMessenger")}
        </a>
      )}
    </>
  );
}

/**
 * Header 2 tầng (theo bố cục mẫu đã duyệt):
 * - Mobile: tầng 1 (màu thương hiệu) tài khoản · logo giữa · ngôn ngữ; tầng 2 (trắng) menu · ô tìm kiếm · giỏ.
 * - lg: tầng 1 logo · ô tìm kiếm + nút · ngôn ngữ · tài khoản · giỏ; tầng 2 nút "Danh mục" · tra cứu đơn + liên hệ.
 * Link tài khoản là link tĩnh (không đọc phiên → giữ static shell); chưa đăng nhập thì proxy chuyển tới trang đăng nhập.
 * Chỉ có MỘT form tìm kiếm và MỘT link giỏ: đổi vị trí bằng CSS grid, dải màu tầng 1 là ::before.
 */
export async function StoreHeader({ locale }: { locale: StoreLocale }) {
  const [t, ts] = await Promise.all([getTranslations("Nav"), getTranslations("Search")]);

  return (
    <header className="sticky top-0 z-30 bg-card shadow-sm before:absolute before:inset-x-0 before:top-0 before:h-12 before:bg-brand lg:before:h-16">
      <div className="relative mx-auto grid max-w-6xl grid-cols-[auto_1fr_auto] grid-rows-[3rem_auto] items-center gap-x-1 pr-2 pl-1 lg:grid-cols-[auto_1fr_auto_auto_auto] lg:grid-rows-[4rem_3rem] lg:gap-x-4 lg:px-4">
        <Link
          href="/"
          className="col-start-2 row-start-1 justify-self-center text-lg font-medium text-brand-foreground lg:col-start-1 lg:justify-self-start lg:text-2xl"
        >
          {BRAND_NAME}
        </Link>

        <LanguageMenu locale={locale} label={t("language")} />

        <div className="col-start-1 row-start-2 lg:row-start-2">
          <CategoryMenu locale={locale} />
        </div>

        {/* Ô tìm kiếm luôn sẵn (GET, chạy cả khi chưa tải JS). */}
        <form
          role="search"
          action={getPathname({ href: "/search", locale })}
          className="relative col-start-2 row-start-2 flex gap-2 py-2 lg:row-start-1 lg:mx-auto lg:w-full lg:max-w-xl lg:py-0"
        >
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Suspense fallback={<input name="q" type="search" placeholder={ts("placeholder")} aria-label={t("search")} className={`${storeField} pl-9`} />}>
            <HeaderSearchInput placeholder={ts("placeholder")} ariaLabel={t("search")} className={`${storeField} pl-9`} />
          </Suspense>
          <button
            type="submit"
            className="hidden h-11 shrink-0 items-center justify-center rounded-lg bg-card px-5 font-medium whitespace-nowrap text-primary hover:bg-muted lg:inline-flex"
          >
            {ts("submit")}
          </button>
        </form>

        <Link
          href="/account"
          aria-label={t("account")}
          data-testid="account-link"
          className="col-start-1 row-start-1 grid size-11 place-items-center text-brand-foreground lg:col-start-4"
        >
          <UserRound className="size-5 lg:size-6" aria-hidden />
        </Link>

        <Link
          href="/cart"
          aria-label={t("cart")}
          className="relative col-start-3 row-start-2 grid size-11 place-items-center justify-self-end lg:col-start-5 lg:row-start-1 lg:text-brand-foreground"
        >
          <ShoppingBag className="size-5 lg:size-6" aria-hidden />
          <Suspense>
            <CartBadge />
          </Suspense>
        </Link>

        <div className="col-span-4 col-start-2 row-start-2 hidden items-center justify-end gap-5 text-sm lg:flex">
          <Link href="/track" className="inline-flex min-h-11 items-center gap-1.5 hover:text-primary">
            <PackageSearch className="size-4" aria-hidden />
            {t("orderLookup")}
          </Link>
          <Suspense>
            <HeaderContact locale={locale} />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
