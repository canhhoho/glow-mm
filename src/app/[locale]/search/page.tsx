import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { listStoreProducts } from "@/server/catalog/store-queries";
import { CatalogFilters, parseCatalogParams } from "@/components/store/catalog-filters";
import { ProductGrid } from "@/components/store/product-card";
import { ListSkeleton, primaryButton, storeCard, storeField } from "@/components/store/ui";

export default function SearchPage(props: PageProps<"/[locale]/search">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <SearchContent {...props} />
    </Suspense>
  );
}

async function SearchContent({ params, searchParams }: PageProps<"/[locale]/search">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const current = parseCatalogParams(await searchParams);
  // Tìm kiếm: chuỗi Zawgyi được nhận dạng và chuyển Unicode trong listStoreProducts (searchVariants).
  const [t, products] = await Promise.all([
    getTranslations({ locale, namespace: "Search" }),
    listStoreProducts({ locale, q: current.q, brand: current.brand, tags: current.tags, sort: current.sort }),
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
        <ProductGrid products={products} locale={locale} />
      </section>
    </div>
  );
}
