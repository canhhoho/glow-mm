import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";
import { ChevronDown, Menu } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { CATALOG_TAG } from "@/server/catalog/category-tree";
import { listCategoryTree } from "@/server/catalog/queries";
import { CloseOnNavigate } from "./close-on-navigate";

/** Cây danh mục dùng chung cho mọi request theo locale (admin đổi catalog → updateTag). */
async function cachedTree(locale: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_TAG);
  return listCategoryTree(locale);
}

const row = "flex min-h-11 items-center px-4";

async function CategoryTree({ locale }: { locale: string }) {
  await connection(); // đọc DB lúc request, không lúc build (image Docker build khi chưa có DB)
  const [t, tree] = await Promise.all([getTranslations({ locale, namespace: "Nav" }), cachedTree(locale)]);
  return (
    <ul className="divide-y divide-border">
      {tree.map((n) =>
        n.children.length === 0 ? (
          <li key={n.slug}>
            <Link href={`/c/${n.slug}`} className={row}>
              {n.name}
            </Link>
          </li>
        ) : (
          <li key={n.slug}>
            <details className="group">
              <summary className={`${row} cursor-pointer list-none justify-between [&::-webkit-details-marker]:hidden`}>
                {n.name}
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <ul className="pb-2">
                <li>
                  <Link href={`/c/${n.slug}`} className={`${row} pl-8 text-sm text-brand`}>
                    {t("allIn", { name: n.name })}
                  </Link>
                </li>
                {n.children.map((c) => (
                  <li key={c.slug}>
                    <Link href={`/c/${c.slug}`} className={`${row} pl-8 text-sm`}>
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ),
      )}
    </ul>
  );
}

/** Menu danh mục dạng <details>: mở/đóng không cần JS; danh sách stream sau static shell. */
export async function CategoryMenu({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "Nav" });
  return (
    <details data-testid="category-menu">
      <summary
        aria-label={t("menu")}
        className="grid size-11 cursor-pointer list-none place-items-center [&::-webkit-details-marker]:hidden"
      >
        <Menu className="size-5" aria-hidden />
      </summary>
      <Suspense>
        <CloseOnNavigate />
      </Suspense>
      <nav
        aria-label={t("categories")}
        className="absolute inset-x-0 top-12 max-h-[calc(100dvh-3rem)] overflow-y-auto border-b border-border bg-card text-foreground shadow-lg"
      >
        <p className="px-4 pt-3 pb-1 text-xs text-muted-foreground uppercase">{t("categories")}</p>
        <ul className="border-b border-border">
          <li>
            <Link href="/" className={row}>
              {t("home")}
            </Link>
          </li>
        </ul>
        <Suspense fallback={<div className="h-44 animate-pulse bg-accent" aria-hidden />}>
          <CategoryTree locale={locale} />
        </Suspense>
      </nav>
    </details>
  );
}
