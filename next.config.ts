import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { buildCsp } from "./src/lib/csp";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const APP_URL_HTTPS = process.env.APP_URL?.startsWith("https://") ?? false;
const DEV = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  // Build độc lập cho Docker/Coolify (server Myanmar).
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          // Tự host (Coolify/Traefik không tự thêm HSTS); chỉ khi APP_URL là https. Không includeSubDomains/preload.
          ...(APP_URL_HTTPS ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
        ],
      },
      {
        // CSP storefront + file công khai (P21, src/lib/csp.ts). Admin/CTV có CSP nonce riêng trong proxy.ts;
        // /sw.js có CSP riêng bên dưới (hai header CSP sẽ bị áp cả hai).
        source: "/((?!admin|ctv|sw\\.js).*)",
        headers: [{ key: "Content-Security-Policy", value: buildCsp({ dev: DEV, https: APP_URL_HTTPS }) }],
      },
      // File tĩnh trong public/ tên không đổi (icon PWA, ảnh chia sẻ): mặc định Next trả max-age=0 → mỗi lần tải
      // trên 3G tốn một vòng hỏi lại. Cache 1 ngày, dùng bản cũ thêm 7 ngày trong lúc kiểm tra bản mới.
      ...["/icons/:path*", "/og-default.png"].map((source) => ({
        source,
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      })),
      {
        // Service worker luôn lấy bản mới nhất; chỉ được tải script cùng origin.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  // Thư viện libvips của sharp (tối ưu ảnh next/image) không được file-tracing chép vào standalone trên Windows.
  outputFileTracingIncludes: {
    "*": ["./node_modules/@img/sharp-win32-*/lib/*.dll", "./node_modules/@img/sharp-libvips-*/lib/**"],
    "/api/admin/orders/vtp-export": ["./src/server/orders/templates/vtp-myanmar.xlsx"],
  },
  images: {
    formats: ["image/avif", "image/webp"],
    // Bỏ 2048/3840 mặc định: khách chủ yếu dùng điện thoại; ít kích thước = ít lần mã hoá AVIF và ít file cache.
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }],
  },
  // Chứng từ chi trả CTV upload qua Server Action (tối đa 5MB + phần đầu multipart).
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
