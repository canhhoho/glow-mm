import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TrackForm } from "@/components/store/track-form";
import { BlockSkeleton, PageTitle } from "@/components/store/ui";

/** Tra cứu đơn: không cho máy tìm kiếm index (SEO, P7). */
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function TrackPage(props: PageProps<"/[locale]/track">) {
  return (
    <Suspense fallback={<BlockSkeleton />}>
      <TrackContent {...props} />
    </Suspense>
  );
}

async function TrackContent({ params, searchParams }: PageProps<"/[locale]/track">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { code } = await searchParams;
  const t = await getTranslations({ locale, namespace: "Track" });
  return (
    <div className="mx-auto max-w-screen-md">
      <PageTitle>{t("title")}</PageTitle>
      <TrackForm locale={locale} code={typeof code === "string" ? code : undefined} />
    </div>
  );
}
