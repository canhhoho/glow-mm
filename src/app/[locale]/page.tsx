import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { StoreLocale } from "@/i18n/routing";
import { HomeCatalog, HomeCatalogSkeleton } from "@/components/store/home-catalog";
import { primaryButton } from "@/components/store/ui";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Banner thuần CSS (không ảnh → không ảnh hưởng LCP trên 3G); quản trị banner ảnh để đợt sau. */}
      <section className="relative isolate flex min-h-40 flex-col justify-center overflow-hidden rounded-xl bg-linear-to-r from-accent via-card to-secondary px-5 py-6 lg:min-h-80 lg:px-12">
        <span aria-hidden className="absolute -top-10 -right-10 -z-10 size-48 rounded-full bg-brand/15 lg:size-96" />
        <span aria-hidden className="absolute -bottom-16 right-24 -z-10 size-32 rounded-full bg-brand-2/20 lg:right-72 lg:size-56" />
        <p className="text-sm text-accent-foreground lg:text-base">{t("heroKicker")}</p>
        <h1 className="text-xl font-medium lg:max-w-xl lg:text-4xl lg:leading-tight">{t("heroTitle")}</h1>
        <Link href="/search" className={`${primaryButton} mt-4 self-start`}>
          {t("bannerCta")}
        </Link>
      </section>
      <Suspense fallback={<HomeCatalogSkeleton />}>
        <HomeCatalog locale={locale as StoreLocale} />
      </Suspense>
    </div>
  );
}
