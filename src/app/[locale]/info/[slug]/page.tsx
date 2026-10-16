import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { INFO_PAGES, isInfoPage } from "@/lib/info-pages";
import { PageTitle } from "@/components/store/ui";

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => INFO_PAGES.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/info/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isInfoPage(slug)) return {};
  const t = await getTranslations({ locale, namespace: "Info" });
  return { title: t(`${slug}.title`) };
}

/** Trang tĩnh: giới thiệu, giao hàng, thanh toán, đổi trả, quyền riêng tư. */
export default async function InfoPage({ params }: PageProps<"/[locale]/info/[slug]">) {
  const { locale, slug } = await params;
  if (!isInfoPage(slug)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Info" });
  const paragraphs = t.raw(`${slug}.body`) as string[];
  return (
    <article className="space-y-3">
      <PageTitle>{t(`${slug}.title`)}</PageTitle>
      {paragraphs.map((p, i) => (
        <p key={i} className="leading-relaxed">
          {p}
        </p>
      ))}
    </article>
  );
}
