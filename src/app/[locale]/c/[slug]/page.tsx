import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { storeCategory, storeProductPage } from "@/server/catalog/cached";
import { CatalogFilters, CatalogPagination, parseCatalogParams } from "@/components/store/catalog-filters";
import { ProductGrid } from "@/components/store/product-card";
import { Breadcrumb, storeCard } from "@/components/store/ui";
import { alternates } from "@/lib/site";

// Metadata và trang dùng chung một lần truy vấn trong cùng request.
const loadCategory = cache((slug: string, locale: string) => storeCategory(slug, locale));

export async function generateMetadata({ params }: PageProps<"/[locale]/c/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  await connection();
  const c = await loadCategory(slug, locale);
  return c ? { title: c.name, alternates: alternates(locale, `/c/${slug}`) } : {};
}

/** Render chặn: HTML trả về đã có danh sách sản phẩm → LCP sớm trên 3G (xem trang sản phẩm). */
export const instant = false;

export default async function CategoryPage({ params, searchParams }: PageProps<"/[locale]/c/[slug]">) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const current = parseCatalogParams(await searchParams);
  const [t, tn, category, result] = await Promise.all([
    getTranslations({ locale, namespace: "Catalog" }),
    getTranslations({ locale, namespace: "Nav" }),
    loadCategory(slug, locale),
    storeProductPage({ locale, category: slug, ...current }),
  ]);
  if (!category) notFound();

  return (
    <div>
      <Breadcrumb
        label={tn("breadcrumb")}
        items={[
          { href: "/", name: tn("home") },
          ...(category.parent ? [{ href: `/c/${category.parent.slug}`, name: category.parent.name }] : []),
          { name: category.name },
        ]}
      />
      <CatalogFilters locale={locale} current={current} />
      <section className={storeCard}>
        <h1 className="mb-2 text-lg font-medium lg:text-xl">{category.name}</h1>
        {category.children.length > 0 && (
          <ul className="mb-3 flex flex-wrap gap-2">
            {category.children.map((c) => (
              <li key={c.slug}>
                <Link href={`/c/${c.slug}`} className="inline-flex min-h-11 items-center rounded-full bg-accent px-4 text-sm lg:min-h-9">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mb-2 text-sm text-muted-foreground">{t("count", { count: result.total })}</p>
        <ProductGrid products={result.products} locale={locale} />
        <CatalogPagination current={current} {...result} locale={locale} />
      </section>
    </div>
  );
}
