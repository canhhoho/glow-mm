import { cache, Suspense } from "react";
import { ProductGallery } from "@/components/store/product-gallery";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { fmtDate, fmtDay } from "@/lib/format";
import { formatMmk } from "@/lib/money";
import { addToCartAction } from "@/server/cart/actions";
import { storeProduct, storeProducts, storeReviews } from "@/server/catalog/cached";
import { ContactLinks } from "@/components/store/contact-links";
import { ProductRail } from "@/components/store/product-card";
import {
  Breadcrumb,
  ImageFallback,
  outlineButton,
  primaryButton,
  storeCard,
  StoreSection,
  storeField,
} from "@/components/store/ui";
import { absoluteUrl, alternates, localizedPath, ogLocale } from "@/lib/site";
import { BRAND_NAME } from "@/lib/brand";
import { breadcrumbJsonLd, jsonLdScript, productJsonLd } from "@/server/catalog/structured-data";

// Metadata và trang dùng chung một lần truy vấn trong cùng request.
const loadProduct = cache((slug: string, locale: string) => storeProduct(slug, locale));

export async function generateMetadata({ params }: PageProps<"/[locale]/p/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  await connection();
  const p = await loadProduct(slug, locale);
  if (!p) return {};
  const title = `${p.name} · ${p.brand}`;
  const description = p.description?.slice(0, 160);
  return {
    title,
    description,
    alternates: alternates(locale, `/p/${slug}`),
    openGraph: {
      type: "website",
      siteName: BRAND_NAME,
      locale: ogLocale(locale),
      title,
      description,
      images: p.images[0]
        ? [{ url: p.images[0].url, alt: p.images[0].alt ?? p.name }]
        : [{ url: "/og-default.png", width: 1200, height: 630, alt: BRAND_NAME }],
    },
  };
}

/**
 * Render chặn (không stream sau static shell): HTML trả về đã có đủ tên/giá/tồn → LCP sớm trên mạng 3G.
 * Trang luôn động (tồn kho + hạn dùng lô tính lúc request) nên không có static shell để validate. Nội dung SP và
 * đánh giá lấy từ cache (P20, `catalog/cached.ts`).
 */
export const instant = false;

const LOW_STOCK = 5;
const RELATED = 5; // đúng 1 hàng desktop; giữ HTML trang SP nhẹ trên 3G

/** Dải "SP khác cùng danh mục" — stream sau phần chính (không chặn LCP). */
async function RelatedProducts({ locale, category, exclude }: { locale: string; category: string; exclude: string }) {
  const [t, tc, list] = await Promise.all([
    getTranslations({ locale, namespace: "Product" }),
    getTranslations({ locale, namespace: "Catalog" }),
    storeProducts({ locale, category, sort: "new", take: RELATED + 1 }),
  ]);
  const products = list.filter((x) => x.slug !== exclude).slice(0, RELATED);
  if (products.length === 0) return null;
  return (
    <StoreSection id="related-h" title={t("related")} more={{ href: `/c/${category}`, label: tc("seeMore") }}>
      <ProductRail products={products} locale={locale} />
    </StoreSection>
  );
}

export default async function ProductPage({ params }: PageProps<"/[locale]/p/[slug]">) {
  const { locale, slug } = await params;
  await connection(); // tồn kho + hạn dùng lô tính lúc request
  setRequestLocale(locale);
  const [t, tn, tc, p] = await Promise.all([
    getTranslations({ locale, namespace: "Product" }),
    getTranslations({ locale, namespace: "Nav" }),
    getTranslations({ locale, namespace: "Catalog" }),
    loadProduct(slug, locale),
  ]);
  if (!p) notFound();
  const [reviews, tr] = await Promise.all([storeReviews(p.id), getTranslations({ locale, namespace: "Review" })]);
  const firstAvailable = p.variants.find((v) => v.available > 0);
  const minPrice = Math.min(...p.variants.map((v) => v.priceMmk));
  const sections = [
    { key: "description", title: t("description"), body: p.description },
    { key: "usage", title: t("usage"), body: p.usage },
    { key: "ingredients", title: t("ingredients"), body: p.ingredients },
    { key: "storage", title: t("storage"), body: p.storageNote },
    { key: "pao", title: t("paoTitle"), body: p.paoMonths ? t("paoMonths", { months: p.paoMonths }) : null },
  ].filter((s) => s.body);

  const pageUrl = absoluteUrl(localizedPath(locale, `/p/${p.slug}`));
  const jsonLd = [
    productJsonLd(p, { url: pageUrl, absolute: absoluteUrl, rating: reviews }),
    breadcrumbJsonLd([
      { name: tn("home"), url: absoluteUrl(localizedPath(locale, "/")) },
      { name: p.category.name, url: absoluteUrl(localizedPath(locale, `/c/${p.category.slug}`)) },
      { name: p.name, url: pageUrl },
    ]),
  ];

  return (
    <div className="space-y-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <Breadcrumb
        label={tn("breadcrumb")}
        items={[
          { href: "/", name: tn("home") },
          { href: `/c/${p.category.slug}`, name: p.category.name },
          { name: p.name },
        ]}
      />

      <article className={`${storeCard} space-y-4 lg:grid lg:grid-cols-2 lg:gap-8 lg:space-y-0`}>
        {/* Cột trái (lg): ảnh chính + thumbnail, dính khi cuộn. */}
        <div className="space-y-2 lg:sticky lg:top-36 lg:self-start">
          {p.images.length ? <ProductGallery images={p.images} name={p.name} imageLabel={t("image")} /> : <div className="relative aspect-square overflow-hidden rounded-xl bg-accent"><ImageFallback brand={p.brand} className="text-8xl" /></div>}
        </div>

        {/* Cột phải (lg): tên, giá, biến thể, nút mua. */}
        <div className="space-y-4">
          <header>
            <p className="text-sm text-muted-foreground">{p.brand}</p>
            <h1 className="text-lg font-medium lg:text-2xl">{p.name}</h1>
            {reviews.average != null && (
              <a href="#reviews" className="text-sm text-brand" data-testid="rating-summary">
                ★ {tr("summary", { avg: reviews.average, count: reviews.count })}
              </a>
            )}
            <p className="mt-2 text-xl font-semibold text-brand lg:text-2xl">
              {p.variants.length > 1 ? tc("from", { price: formatMmk(minPrice, locale) }) : formatMmk(minPrice, locale)}
            </p>
            {p.tags.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1">
                {p.tags.map((tag) => (
                  <li key={tag} className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                    {tag}
                  </li>
                ))}
              </ul>
            )}
          </header>

          <form action={addToCartAction} className="space-y-3" data-analytics-add-cart>
            <input type="hidden" name="locale" value={locale} />
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm">{t("variant")}</legend>
              {p.variants.map((v) => (
                <label
                  key={v.id}
                  className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 has-checked:border-brand has-disabled:opacity-50"
                >
                  <input
                    type="radio"
                    name="variantId"
                    value={v.id}
                    required
                    disabled={v.available <= 0}
                    defaultChecked={v.id === firstAvailable?.id}
                  />
                  <span className="flex-1">
                    <span className="block">
                      {v.label} {v.isBundle && <span className="text-xs text-brand-2">· {t("bundle")}</span>}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {v.available <= 0
                        ? t("outOfStock")
                        : v.available <= LOW_STOCK
                          ? t("lowStock", { count: v.available })
                          : t("inStock")}
                      {v.expiryDate && ` · ${t("expiry")}: ${fmtDay(v.expiryDate)}`}
                    </span>
                  </span>
                  <span className="font-medium text-brand">{formatMmk(v.priceMmk, locale)}</span>
                </label>
              ))}
            </fieldset>
            {p.variants.some((v) => v.expiryDate) && <p className="text-xs text-muted-foreground">{t("expiryNote")}</p>}
            {firstAvailable ? (
              <>
                <label className="block w-24 space-y-1 text-sm">
                  <span>{t("qty")}</span>
                  <input name="qty" type="number" min={1} max={99} defaultValue={1} inputMode="numeric" className={storeField} />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="submit" name="intent" value="cart" className={outlineButton}>
                    {t("addToCart")}
                  </button>
                  <button type="submit" name="intent" value="buy" className={primaryButton}>
                    {t("buyNow")}
                  </button>
                </div>
              </>
            ) : (
              <p className="font-medium text-muted-foreground">{t("outOfStock")}</p>
            )}
          </form>

          <ContactLinks locale={locale} />
        </div>
      </article>

      {sections.length > 0 && (
        <div className={`${storeCard} space-y-2`}>
          {sections.map((s) => (
            <details key={s.key} open={s.key === "description"} className="rounded-lg border border-border bg-card">
              <summary className="flex min-h-11 cursor-pointer items-center px-3 font-medium">{s.title}</summary>
              <p className="px-3 pb-3 text-sm whitespace-pre-line">{s.body}</p>
            </details>
          ))}
        </div>
      )}

      <section id="reviews" aria-labelledby="reviews-h" className={`${storeCard} space-y-2`}>
        <h2 id="reviews-h" className="font-medium">
          {tr("heading")}
        </h2>
        {reviews.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tr("none")}</p>
        ) : (
          <ul className="space-y-2">
            {reviews.items.map((r) => (
              <li key={r.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                <p>
                  <span className="text-brand" aria-label={tr("stars", { n: r.rating })}>
                    {"★".repeat(r.rating)}
                    <span className="text-muted-foreground">{"★".repeat(5 - r.rating)}</span>
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {r.author} · {fmtDate(r.createdAt)}
                  </span>
                </p>
                {r.body && <p className="mt-1 whitespace-pre-line">{r.body}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Suspense>
        <RelatedProducts locale={locale} category={p.category.slug} exclude={p.slug} />
      </Suspense>
    </div>
  );
}
