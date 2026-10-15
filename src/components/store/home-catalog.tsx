import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { StoreLocale } from "@/i18n/routing";
import { listRootCategories } from "@/server/catalog/queries";
import { listStoreProducts } from "@/server/catalog/store-queries";
import { ProductGrid } from "./product-card";
import { ListSkeleton } from "./ui";

/** Phần dữ liệu (DB) của trang chủ — render lúc request, stream sau static shell. */
export async function HomeCatalog({ locale }: { locale: StoreLocale }) {
  await connection();
  const t = await getTranslations({ locale, namespace: "Home" });
  const [categories, products] = await Promise.all([
    listRootCategories(locale),
    listStoreProducts({ locale, sort: "new" }),
  ]);

  return (
    <>
      <section aria-labelledby="cat-h">
        <h2 id="cat-h" className="mb-2 font-medium">
          {t("categories")}
        </h2>
        <ul className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/c/${c.slug}`}
                className="inline-flex min-h-11 items-center rounded-full bg-accent px-4 text-sm text-accent-foreground"
              >
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="pop-h">
        <h2 id="pop-h" className="mb-2 font-medium">
          {t("popular")}
        </h2>
        {products.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ProductGrid products={products.slice(0, 8)} locale={locale} />
        )}
      </section>
    </>
  );
}

export function HomeCatalogSkeleton() {
  return <ListSkeleton />;
}
