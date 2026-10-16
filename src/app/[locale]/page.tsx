import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import type { StoreLocale } from "@/i18n/routing";
import { HeroBanner, HomeBanner } from "@/components/store/home-banner";
import { HomeCatalog, HomeCatalogSkeleton } from "@/components/store/home-catalog";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Static shell có sẵn banner CSS (LCP sớm); banner ảnh (admin quản lý) stream vào cùng khung tỉ lệ. */}
      <Suspense fallback={<HeroBanner locale={locale} />}>
        <HomeBanner locale={locale} />
      </Suspense>
      <Suspense fallback={<HomeCatalogSkeleton />}>
        <HomeCatalog locale={locale as StoreLocale} />
      </Suspense>
    </div>
  );
}
