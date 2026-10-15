import "../globals.css";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { StoreHeader } from "@/components/store/header";
import { StoreFooter } from "@/components/store/footer";
import { ChatFab } from "@/components/store/chat-fab";
import { SwRegister } from "@/components/store/sw-register";

/**
 * Font Myanmar tự host: chỉ phần chữ Myanmar, 1 độ đậm (400) để nhẹ trên 3G; Next tự preload + tạo fallback metric.
 * Chữ Latin dùng font hệ thống. (Admin vẫn dùng @fontsource đầy đủ 400/500.)
 */
const myanmarFont = localFont({
  src: "../../../node_modules/@fontsource/noto-sans-myanmar/files/noto-sans-myanmar-myanmar-400-normal.woff2",
  weight: "400",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
  // Font chỉ có chữ Myanmar → chữ Latin dùng thẳng font hệ thống, không cần fallback chỉnh metric theo Arial.
  adjustFontFallback: false,
});

/** Chỉ gửi xuống client các namespace mà Client Component storefront dùng (giảm kích thước trang). */
const CLIENT_NAMESPACES = ["Checkout", "Order", "Track", "Review"] as const;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Meta" });
  // Manifest sinh từ src/app/manifest.ts (Next tự gắn <link rel="manifest">).
  return {
    title: t("title"),
    description: t("description"),
    icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  };
}

export const viewport: Viewport = { themeColor: "#e8657a", width: "device-width", initialScale: 1 };

export default async function StoreLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  const clientMessages = Object.fromEntries(CLIENT_NAMESPACES.map((ns) => [ns, messages[ns]]));

  return (
    <html lang={locale} data-theme="store" className={myanmarFont.className}>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <NextIntlClientProvider messages={clientMessages}>
          <div className="mx-auto flex min-h-dvh max-w-screen-md flex-col">
            <StoreHeader locale={locale} />
            <main className="flex-1 px-4 py-4">{children}</main>
            <StoreFooter />
            <ChatFab locale={locale} />
            <SwRegister />
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
