import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { routing } from "@/i18n/routing";
import { localizedPath, siteUrl } from "@/lib/site";

/** Trang riêng tư/không có giá trị tìm kiếm (giỏ, thanh toán, đơn, tra cứu, kết quả tìm kiếm) — cả hai locale. */
const PRIVATE = ["/cart", "/checkout", "/order/", "/track", "/search"];

/** robots.txt — URL lấy lúc request (APP_URL của môi trường đang chạy). */
export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/ctv", "/api/", ...routing.locales.flatMap((l) => PRIVATE.map((p) => localizedPath(l, p)))],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
