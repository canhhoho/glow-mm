import { describe, expect, it } from "vitest";
import { createPositiveCache, parseStoreSlugPath, storeSlugExists } from "@/server/catalog/store-slugs";

describe("Slug storefront cho proxy 404", () => {
  it("chỉ nhận /<locale>/(p|c|info)/<slug>", () => {
    expect(parseStoreSlugPath("/en/p/sen-viet")).toEqual({ kind: "p", slug: "sen-viet" });
    expect(parseStoreSlugPath("/my/c/skincare/")).toEqual({ kind: "c", slug: "skincare" });
    expect(parseStoreSlugPath("/en/info/about")).toEqual({ kind: "info", slug: "about" });
    expect(parseStoreSlugPath("/en/p/%E1%80%80")).toEqual({ kind: "p", slug: "က" });
    expect(parseStoreSlugPath("/en/p/%E0%A4")).toEqual({ kind: "p", slug: "" });
    for (const p of ["/en", "/en/p", "/en/p/a/b", "/en/cart", "/en/search", "/en/order/ABC"]) {
      expect(parseStoreSlugPath(p)).toBeNull();
    }
  });

  it("trang thông tin kiểm tra theo danh sách tĩnh, không cần DB", async () => {
    expect(await storeSlugExists("info", "shipping")).toBe(true);
    expect(await storeSlugExists("info", "khong-co")).toBe(false);
    expect(await storeSlugExists("p", "")).toBe(false);
  });

  it("cache dương tính hết hạn theo TTL và tự dọn khi đầy", () => {
    let t = 0;
    const cache = createPositiveCache(1_000, 2, () => t);
    cache.add("a");
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
    t = 1_000;
    expect(cache.has("a")).toBe(false);
    cache.add("a");
    cache.add("b");
    cache.add("c"); // đầy → xoá hết rồi thêm
    expect([cache.has("a"), cache.has("b"), cache.has("c")]).toEqual([false, false, true]);
  });
});
