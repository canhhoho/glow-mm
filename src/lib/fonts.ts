import localFont from "next/font/local";

/**
 * Font Myanmar cho admin + cổng CTV (400/500), chỉ áp cho ký tự Myanmar (unicode-range). Nếu font này phủ cả chữ
 * Latin/Việt, trình duyệt lấy ascent/descent rất cao của nó cho mọi dòng → chữ trong nút lệch lên trên.
 * Chữ Latin/Việt dùng font hệ thống. (Storefront dùng bản riêng chỉ 400 — src/app/[locale]/layout.tsx.)
 */
export const myanmarFont = localFont({
  src: [
    { path: "../../node_modules/@fontsource/noto-sans-myanmar/files/noto-sans-myanmar-myanmar-400-normal.woff2", weight: "400" },
    { path: "../../node_modules/@fontsource/noto-sans-myanmar/files/noto-sans-myanmar-myanmar-500-normal.woff2", weight: "500" },
  ],
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
  adjustFontFallback: false,
  // Lấy từ subset "myanmar" của @fontsource (next/font chỉ nhận giá trị viết thẳng).
  declarations: [{ prop: "unicode-range", value: "U+1000-109F, U+200C-200D, U+25CC, U+A92E, U+A9E0-A9FE, U+AA60-AA7F, U+116D0-116E3" }],
});
