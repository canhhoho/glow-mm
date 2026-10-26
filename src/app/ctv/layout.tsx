import "../globals.css";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { myanmarFont } from "@/lib/fonts";

// Cổng CTV luôn động (cookie ngôn ngữ + phiên đăng nhập); không cần instant navigation.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Ctv");
  return {
    title: t("metaTitle"),
    robots: { index: false, follow: false },
    icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  };
}

export default async function CtvRootLayout({ children }: LayoutProps<"/ctv">) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={myanmarFont.className}>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
