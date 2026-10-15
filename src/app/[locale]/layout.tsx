import "@fontsource/noto-sans-myanmar/400.css";
import "@fontsource/noto-sans-myanmar/500.css";
import "../globals.css";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { StoreHeader } from "@/components/store/header";
import { StoreFooter } from "@/components/store/footer";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Meta" });
  return { title: t("title"), description: t("description"), manifest: "/manifest.webmanifest" };
}

export const viewport: Viewport = { themeColor: "#e8657a", width: "device-width", initialScale: 1 };

export default async function StoreLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} data-theme="store">
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <NextIntlClientProvider>
          <div className="mx-auto flex min-h-dvh max-w-screen-md flex-col">
            <StoreHeader locale={locale} />
            <main className="flex-1 px-4 py-4">{children}</main>
            <StoreFooter />
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
