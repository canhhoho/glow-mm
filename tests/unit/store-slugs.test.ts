import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createPositiveCache, isKnownStorePath, parseStoreSlugPath, storeSlugExists } from "@/server/catalog/store-slugs";

/** Mọi route trang trong src/app/[locale] (thay [param] bằng giá trị mẫu). */
function storeRoutes(dir = path.resolve("src/app/[locale]"), prefix = ""): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isFile() && e.name === "page.tsx") out.push(prefix || "/");
    if (e.isDirectory() && !e.name.startsWith("_") && !e.name.startsWith("(")) {
      const seg = e.name.startsWith("[") ? "mau-thu" : e.name;
      out.push(...storeRoutes(path.join(dir, e.name), `${prefix}/${seg}`));
    }
  }
  return out;
}

describe("Slug storefront cho proxy 404", () => {
  it("chỉ nhận /<locale>/(p|c|info)/<slug>", () => {
    expect(parseStoreSlugPath("/en/p/sen-viet")).toEqual({ kind: "p", slug: "sen-viet" });
    expect(parseStoreSlugPath("/my/c/skincare/")).toEqual({ kind: "c", slug: "skincare" });
    expect(parseStoreSlugPath("/en/info/about")).toEqual({ kind: "info", slug: "about" });
    expect(parseStoreSlugPath("/my/collection/sale")).toEqual({ kind: "collection", slug: "sale" });
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

  it("mọi route trong src/app/[locale] đều được proxy nhận (thêm route mới phải cập nhật isKnownStorePath)", () => {
    const routes = storeRoutes();
    expect(routes.length).toBeGreaterThan(8);
    for (const r of routes) {
      for (const locale of ["my", "en"]) {
        const p = r === "/" ? `/${locale}` : `/${locale}${r}`;
        expect(isKnownStorePath(p), p).toBe(true);
      }
    }
  });

  it("đường dẫn lạ → không nhận (proxy trả trang 404 có giao diện)", () => {
    for (const p of ["/en/foo", "/en/p/a/b", "/my/khong-co", "/fr/p/a", "/en/cart/x", "/en/order", "/en/p/"]) {
      expect(isKnownStorePath(p), p).toBe(false);
    }
    for (const p of ["/en", "/my/", "/en/cart", "/my/order/OD-1", "/en/collection/sale/"]) {
      expect(isKnownStorePath(p), p).toBe(true);
    }
  });
});
