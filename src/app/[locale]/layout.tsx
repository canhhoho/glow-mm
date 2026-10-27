import "../globals.css";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { ogLocale, siteUrl } from "@/lib/site";
import { StoreHeader } from "@/components/store/header";
import { StoreFooter } from "@/components/store/footer";
import { ChatFab } from "@/components/store/chat-fab";
import { SwRegister } from "@/components/store/sw-register";

/**
 * Font Myanmar tự host: chỉ phần chữ Myanmar, 1 độ đậm (400) để nhẹ trên 3G; Next tự preload + tạo fallback metric.
 * Chữ Latin dùng font hệ thống. (Admin dùng cùng cách, thêm độ đậm 500.)
 */
const myanmarFont = localFont({
  src: "../../../node_modules/@fontsource/noto-sans-myanmar/files/noto-sans-myanmar-myanmar-400-normal.woff2",
  weight: "400",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
  // Font chỉ có chữ Myanmar → chữ Latin dùng thẳng font hệ thống, không cần fallback chỉnh metric theo Arial.
  adjustFontFallback: false,
  // Thiếu unicode-range thì trình duyệt vẫn lấy ascent/descent rất cao của font này cho chữ Latin (chữ trong nút lệch)
  // và tải font cả ở trang /en. Giá trị lấy từ subset "myanmar" của @fontsource.
  declarations: [{ prop: "unicode-range", value: "U+1000-109F, U+200C-200D, U+25CC, U+A92E, U+A9E0-A9FE, U+AA60-AA7F, U+116D0-116E3" }],
});

/** Chỉ gửi xuống client các namespace mà Client Component storefront dùng (giảm kích thước trang). */
const CLIENT_NAMESPACES = ["Checkout", "Order", "Track", "Review", "Auth", "Account", "Address"] as const;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Meta" });
  // Manifest sinh từ src/app/manifest.ts (Next tự gắn <link rel="manifest">).
  // canonical/hreflang đặt ở từng trang (alternates); ảnh OG mặc định là file tĩnh để trang SP ghi đè được.
  return {
    metadataBase: siteUrl(),
    title: { default: t("title"), template: "%s · Glow VN" },
    description: t("description"),
    icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
    openGraph: {
      type: "website",
      siteName: "Glow VN",
      locale: ogLocale(locale),
      title: t("title"),
      description: t("description"),
      images: [{ url: "/og-default.png", width: 1200, height: 630, alt: "Glow VN" }],
    },
    twitter: { card: "summary_large_image" },
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
          {/* Header/footer trải hết chiều ngang; nội dung trong khung max-w-6xl (mobile-first). */}
          <div className="flex min-h-dvh flex-col">
            <StoreHeader locale={locale} />
            <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-4 lg:py-6">{children}</main>
            <StoreFooter locale={locale} />
            <ChatFab locale={locale} />
            <SwRegister />
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
