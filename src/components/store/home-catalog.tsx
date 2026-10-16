import Image from "next/image";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { StoreLocale } from "@/i18n/routing";
import { listRootCategories } from "@/server/catalog/queries";
import { listStoreProducts } from "@/server/catalog/store-queries";
import { homeCollections } from "@/server/content/collections";
import { ProductRail } from "./product-card";
import { ListSkeleton, StoreSection, storeCard } from "./ui";

const RAIL_SIZE = 10;

/**
 * Phần dữ liệu (DB) của trang chủ — render lúc request, stream sau static shell.
 * Nhóm hàng (danh mục gốc, có icon) → các bộ sưu tập (admin chọn tay) → "Sản phẩm mới" → mỗi danh mục gốc một dải.
 */
export async function HomeCatalog({ locale }: { locale: StoreLocale }) {
  await connection();
  const [t, tc, categories] = await Promise.all([
    getTranslations({ locale, namespace: "Home" }),
    getTranslations({ locale, namespace: "Catalog" }),
    listRootCategories(locale),
  ]);
  const [collections, newest, ...byCategory] = await Promise.all([
    homeCollections(locale, new Date(), RAIL_SIZE),
    listStoreProducts({ locale, sort: "new", take: RAIL_SIZE }),
    ...categories.map((c) => listStoreProducts({ locale, category: c.slug, sort: "new", take: RAIL_SIZE })),
  ]);

  if (newest.length === 0) return <p className="text-sm text-muted-foreground">{t("empty")}</p>;

  return (
    <>
      <section aria-labelledby="cat-h" className={storeCard}>
        <h2 id="cat-h" className="mb-3 font-medium lg:text-lg">
          {t("categories")}
        </h2>
        <ul className="-mx-3 grid snap-x auto-cols-[6.5rem] grid-flow-col gap-3 overflow-x-auto scroll-px-3 px-3 pb-1 sm:-mx-4 sm:scroll-px-4 sm:px-4 lg:auto-cols-[8rem]">
          {categories.map((c) => (
            <li key={c.slug} className="snap-start">
              <Link
                href={`/c/${c.slug}`}
                className="flex h-full flex-col items-center gap-2 rounded-lg bg-background p-2 text-center text-sm hover:bg-accent"
              >
                {c.iconUrl ? (
                  <Image src={c.iconUrl} alt="" width={64} height={64} sizes="64px" className="size-14 rounded-full object-cover lg:size-16" />
                ) : (
                  <span
                    aria-hidden
                    className="grid size-14 place-items-center rounded-full bg-accent text-2xl font-medium text-accent-foreground lg:size-16"
                  >
                    {Array.from(c.name.trim())[0]?.toUpperCase()}
                  </span>
                )}
                <span className="line-clamp-2">{c.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {collections.map((c) => (
        <StoreSection key={c.slug} id={`col-${c.slug}`} title={c.name} more={{ href: `/collection/${c.slug}`, label: tc("seeMore") }}>
          <ProductRail products={c.products} locale={locale} />
        </StoreSection>
      ))}

      <StoreSection id="new-h" title={t("newArrivals")} more={{ href: "/search", label: tc("seeMore") }}>
        <ProductRail products={newest} locale={locale} />
      </StoreSection>

      {categories.map((c, i) =>
        byCategory[i].length === 0 ? null : (
          <StoreSection key={c.slug} id={`cat-${c.slug}`} title={c.name} more={{ href: `/c/${c.slug}`, label: tc("seeMore") }}>
            <ProductRail products={byCategory[i]} locale={locale} />
          </StoreSection>
        ),
      )}
    </>
  );
}

export function HomeCatalogSkeleton() {
  return <ListSkeleton />;
}
