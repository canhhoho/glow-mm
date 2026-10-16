import { prisma } from "@/lib/db";
import { isInfoPage } from "@/lib/info-pages";
import { collectionVisible } from "@/server/content/collections";

/**
 * Kiểm tra nhanh slug storefront có tồn tại không — dùng trong proxy để trả HTTP 404 thật.
 * (Cache Components gửi static shell với status 200 trước khi notFound() trong page chạy.)
 * Điều kiện phải khớp getStoreProduct/getStoreCategory; page vẫn gọi notFound() làm lớp dự phòng.
 */
export type StoreSlugKind = "p" | "c" | "info" | "collection";

const STORE_PATH = /^\/([^/]+)\/(p|c|info|collection)\/([^/]+)\/?$/;

/** `/en/p/abc` → { kind: "p", slug: "abc" }; đường dẫn khác → null. */
export function parseStoreSlugPath(pathname: string): { kind: StoreSlugKind; slug: string } | null {
  const m = STORE_PATH.exec(pathname);
  if (!m) return null;
  try {
    return { kind: m[2] as StoreSlugKind, slug: decodeURIComponent(m[3]) };
  } catch {
    return { kind: m[2] as StoreSlugKind, slug: "" }; // %-encoding hỏng → chắc chắn không có
  }
}

/**
 * Cache dương tính trong bộ nhớ tiến trình: slug có thật thì nhớ một lúc (prefetch link không truy vấn DB lặp lại).
 * Không cache kết quả "không có" → sản phẩm vừa đăng xem được ngay.
 */
export function createPositiveCache(ttlMs: number, max: number, now: () => number = Date.now) {
  const seen = new Map<string, number>();
  return {
    has(key: string) {
      const exp = seen.get(key);
      if (exp === undefined) return false;
      if (exp > now()) return true;
      seen.delete(key);
      return false;
    },
    add(key: string) {
      if (seen.size >= max) seen.clear();
      seen.set(key, now() + ttlMs);
    },
  };
}

const known = createPositiveCache(60_000, 5_000);

export async function storeSlugExists(kind: StoreSlugKind, slug: string): Promise<boolean> {
  if (kind === "info") return isInfoPage(slug);
  if (!slug) return false;
  const key = `${kind}:${slug}`;
  if (known.has(key)) return true;
  if (kind === "collection") {
    // Bộ sưu tập có lịch hiển thị → không cache (truy vấn theo slug unique, rẻ).
    return collectionVisible(slug, new Date());
  }
  const found =
    kind === "p"
      ? await prisma.product.findFirst({ where: { slug, published: true, variants: { some: { active: true } } }, select: { id: true } })
      : await prisma.category.findUnique({ where: { slug }, select: { id: true } });
  if (found) known.add(key);
  return !!found;
}
