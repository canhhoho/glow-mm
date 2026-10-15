import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getStoreCategory, listStoreProducts } from "@/server/catalog/store-queries";
import { CatalogFilters, parseCatalogParams } from "@/components/store/catalog-filters";
import { ProductGrid } from "@/components/store/product-card";
import { ListSkeleton } from "@/components/store/ui";

export default function CategoryPage(props: PageProps<"/[locale]/c/[slug]">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <CategoryContent {...props} />
    </Suspense>
  );
}

async function CategoryContent({ params, searchParams }: PageProps<"/[locale]/c/[slug]">) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const current = parseCatalogParams(await searchParams);
  const [t, category, products] = await Promise.all([
    getTranslations({ locale, namespace: "Catalog" }),
    getStoreCategory(slug, locale),
    listStoreProducts({ locale, category: slug, brand: current.brand, tags: current.tags, sort: current.sort }),
  ]);
  if (!category) notFound();

  return (
    <div>
      <h1 className="mb-2 text-lg font-medium">{category.name}</h1>
      {category.children.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2">
          {category.children.map((c) => (
            <li key={c.slug}>
              <Link href={`/c/${c.slug}`} className="inline-flex min-h-11 items-center rounded-full bg-accent px-4 text-sm">
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <CatalogFilters locale={locale} current={current} />
      <p className="mb-2 text-sm text-muted-foreground">{t("count", { count: products.length })}</p>
      <ProductGrid products={products} locale={locale} />
    </div>
  );
}
