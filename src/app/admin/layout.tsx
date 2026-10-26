import "../globals.css";
import type { Metadata } from "next";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";

/**
 * Font Myanmar chỉ áp cho ký tự Myanmar (unicode-range). Nếu font này phủ cả chữ Latin/Việt, trình duyệt lấy
 * ascent/descent rất cao của nó cho mọi dòng → chữ trong nút lệch lên trên. Chữ Latin/Việt dùng font hệ thống.
 */
const myanmarFont = localFont({
  src: [
    { path: "../../../node_modules/@fontsource/noto-sans-myanmar/files/noto-sans-myanmar-myanmar-400-normal.woff2", weight: "400" },
    { path: "../../../node_modules/@fontsource/noto-sans-myanmar/files/noto-sans-myanmar-myanmar-500-normal.woff2", weight: "500" },
  ],
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
  adjustFontFallback: false,
  // Lấy từ subset "myanmar" của @fontsource (next/font chỉ nhận giá trị viết thẳng).
  declarations: [{ prop: "unicode-range", value: "U+1000-109F, U+200C-200D, U+25CC, U+A92E, U+A9E0-A9FE, U+AA60-AA7F, U+116D0-116E3" }],
});

// Admin luôn động (cookie locale + phiên đăng nhập); không cần instant navigation.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={myanmarFont.className}>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
