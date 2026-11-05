import "../globals.css";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { staffMyanmarFont } from "@/lib/fonts";

// Admin luôn động (cookie locale + phiên đăng nhập); không cần instant navigation.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={staffMyanmarFont.className}>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
