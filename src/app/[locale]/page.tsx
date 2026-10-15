import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { StoreLocale } from "@/i18n/routing";
import { HomeCatalog, HomeCatalogSkeleton } from "@/components/store/home-catalog";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");

  return (
    <div className="space-y-5">
      <section className="rounded-xl bg-secondary px-4 py-5 text-secondary-foreground">
        <p className="text-sm">{t("heroKicker")}</p>
        <h1 className="text-lg font-medium">{t("heroTitle")}</h1>
      </section>
      <Suspense fallback={<HomeCatalogSkeleton />}>
        <HomeCatalog locale={locale as StoreLocale} />
      </Suspense>
    </div>
  );
}
