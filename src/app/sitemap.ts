import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { routing } from "@/i18n/routing";
import { absoluteUrl, localizedPath } from "@/lib/site";
import { cachedSitemapRows } from "@/server/catalog/cached";
import { sitemapPaths } from "@/server/catalog/sitemap";

/** sitemap.xml: mỗi trang công khai một URL (locale mặc định) kèm hreflang my/en. Dữ liệu cache (P20), lịch xét lúc request. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const entries = sitemapPaths(await cachedSitemapRows(), new Date());
  return entries.map((e) => ({
    url: absoluteUrl(localizedPath(routing.defaultLocale, e.path)),
    ...(e.lastModified ? { lastModified: e.lastModified } : {}),
    alternates: {
      languages: Object.fromEntries(routing.locales.map((l) => [l, absoluteUrl(localizedPath(l, e.path))])),
    },
  }));
}
