import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { formatMmk } from "@/lib/money";
import type { StoreLocale } from "@/i18n/routing";
import { getHomeCatalog } from "@/server/catalog/queries";

/** Phần dữ liệu (DB) của trang chủ — render lúc request, stream sau static shell. */
export async function HomeCatalog({ locale }: { locale: StoreLocale }) {
  await connection();
  const t = await getTranslations("Home");
  const { categories, products } = await getHomeCatalog(locale);

  return (
    <>
      <section aria-labelledby="cat-h">
        <h2 id="cat-h" className="mb-2 font-medium">
          {t("categories")}
        </h2>
        <ul className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <li key={c.slug} className="rounded-full bg-accent px-3 py-1 text-sm text-accent-foreground">
              {c.name}
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
          <ul className="grid grid-cols-2 gap-3">
            {products.map((p) => (
              <li key={p.slug} className="rounded-lg border border-border bg-card p-2">
                <div className="mb-2 aspect-square rounded-md bg-accent" aria-hidden />
                <p className="text-xs text-muted-foreground">{p.brand}</p>
                <p className="line-clamp-2 text-sm">{p.name}</p>
                {p.priceMmk != null && <p className="font-medium text-brand">{formatMmk(p.priceMmk, locale)}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export function HomeCatalogSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3" aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="aspect-[3/4] animate-pulse rounded-lg bg-accent" />
      ))}
    </div>
  );
}
