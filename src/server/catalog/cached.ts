import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { HOME_TAG, isInSchedule } from "@/server/content/common";
import { loadCollectionRow, loadHomeCollectionRows } from "@/server/content/collections";
import { productReviews, REVIEWS_TAG } from "@/server/reviews/reviews";
import { CATALOG_TAG } from "./category-tree";
import { listRootCategories } from "./queries";
import { loadSitemapRows } from "./sitemap";
import {
  getStoreCategory,
  listStoreProducts,
  loadCardRows,
  loadProductContent,
  sortCards,
  storeFilterOptions,
  withProductStock,
  withStock,
  type ProductListQuery,
} from "./store-queries";

/**
 * Cache dữ liệu storefront (P20). Chỉ phần NỘI DUNG (tên, giá, ảnh, danh mục, bộ sưu tập, đánh giá đã duyệt) được
 * cache — xoá bằng `updateTag` trong action admin (CATALOG_TAG / HOME_TAG / REVIEWS_TAG), `cacheLife("hours")` là lưới
 * an toàn. Tồn kho + lịch hiển thị luôn tính lúc request (`withStock`, `withProductStock`, `isInSchedule`).
 * Hàm "use cache" không đọc cookies/headers và không nhận `new Date()` làm tham số.
 */

export async function cachedCardRows(query: Omit<ProductListQuery, "sort" | "q">) {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  return loadCardRows(query);
}

/** Danh sách thẻ SP cho trang danh mục/tìm kiếm/SP liên quan. Có từ khoá `q` → không cache (vô hạn tổ hợp). */
export async function storeProducts(query: ProductListQuery) {
  if (query.q?.trim()) return listStoreProducts(query);
  const { sort, ...rest } = query;
  const [cards] = await withStock([await cachedCardRows(rest)]);
  return sortCards(cards, sort);
}

async function cachedProductContent(slug: string, locale: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  return loadProductContent(slug, locale);
}

/** Trang SP: nội dung từ cache + tồn/hạn dùng lô tính lúc request. */
export async function storeProduct(slug: string, locale: string) {
  const content = await cachedProductContent(slug, locale);
  return content ? withProductStock(content) : null;
}

export async function storeCategory(slug: string, locale: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  return getStoreCategory(slug, locale);
}

export async function storeFilters(locale: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  return storeFilterOptions(locale);
}

export async function storeRootCategories(locale: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  return listRootCategories(locale);
}

/** Bộ sưu tập trang chủ chưa xét lịch, thẻ SP chưa có tồn (trang chủ tự lọc lịch + gộp tồn). */
export async function cachedHomeCollectionRows(locale: string, take: number) {
  "use cache";
  cacheLife("hours");
  cacheTag(HOME_TAG, CATALOG_TAG);
  return loadHomeCollectionRows(locale, take);
}

async function cachedCollectionRow(slug: string, locale: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(HOME_TAG, CATALOG_TAG);
  return loadCollectionRow(slug, locale);
}

/** Trang /collection/[slug]: null nếu không có, đang tắt hoặc ngoài lịch tại `now`. */
export async function storeCollection(slug: string, locale: string, now: Date) {
  const c = await cachedCollectionRow(slug, locale);
  if (!c || !isInSchedule(c, now)) return null;
  const [products] = await withStock([c.products]);
  return { slug: c.slug, name: c.name, products };
}

export async function storeReviews(productId: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(REVIEWS_TAG);
  return productReviews(productId);
}

export async function cachedSitemapRows() {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG, HOME_TAG);
  return loadSitemapRows();
}
