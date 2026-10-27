import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { loadAddressCatalog, LOCATIONS_TAG } from "./locations";

/** Danh mục địa chỉ dùng chung mọi request theo ngôn ngữ (admin sửa tên / bật tắt → updateTag). */
export async function addressCatalog(locale: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(LOCATIONS_TAG);
  return loadAddressCatalog(locale);
}
