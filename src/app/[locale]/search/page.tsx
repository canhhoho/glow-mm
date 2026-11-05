import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { storeProductPage } from "@/server/catalog/cached";
import { CatalogFilters, CatalogPagination, parseCatalogParams } from "@/components/store/catalog-filters";
import { ProductGrid } from "@/components/store/product-card";
import { ListSkeleton, primaryButton, storeCard, storeField } from "@/components/store/ui";

/** Kết quả tìm kiếm: không cho máy tìm kiếm index (SEO, P7). */
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function SearchPage(props: PageProps<"/[locale]/search">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <SearchContent {...props} />
    </Suspense>
  );
}

async function SearchContent({ params, searchParams }: PageProps<"/[locale]/search">) {
  await connection(); // Truy vấn động/tồn và transaction chỉ chạy khi có request.
  const { locale } = await params;
  setRequestLocale(locale);
  const current = parseCatalogParams(await searchParams);
  // Tìm kiếm: chuỗi Zawgyi được nhận dạng và chuyển Unicode trong loadCardRows (searchVariants); có `q` → không cache.
  const [t, result] = await Promise.all([
    getTranslations({ locale, namespace: "Search" }),
    storeProductPage({ locale, ...current }),
  ]);

  return (
    <div>
      <h1 className="mb-3 text-lg font-medium">{t("title")}</h1>
      <form role="search" className="mb-3 flex gap-2 lg:max-w-2xl">
        <input
          name="q"
          type="search"
          defaultValue={current.q}
          placeholder={t("placeholder")}
          aria-label={t("title")}
          className={storeField}
        />
        <button type="submit" className={primaryButton}>
          {t("submit")}
        </button>
      </form>
      <CatalogFilters locale={locale} current={current} />
      <section className={storeCard}>
        {current.q && <h2 className="mb-2 text-sm text-muted-foreground">{t("results", { q: current.q })}</h2>}
        <ProductGrid products={result.products} locale={locale} />
        <CatalogPagination current={current} {...result} locale={locale} />
      </section>
    </div>
  );
}
