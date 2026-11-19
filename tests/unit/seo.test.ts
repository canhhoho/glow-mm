import { afterEach, describe, expect, it, vi } from "vitest";
import { absoluteUrl, alternates, localePrefix, localizedPath, ogLocale, siteUrl } from "@/lib/site";
import { breadcrumbJsonLd, jsonLdScript, productJsonLd } from "@/server/catalog/structured-data";

afterEach(() => vi.unstubAllEnvs());

describe("URL gốc + hreflang", () => {
  it("siteUrl lấy APP_URL (bỏ / cuối), thiếu/sai thì localhost", () => {
    vi.stubEnv("APP_URL", "https://glow.example/");
    expect(siteUrl()).toBe("https://glow.example");
    expect(absoluteUrl("/api/files/a.png")).toBe("https://glow.example/api/files/a.png");
    expect(absoluteUrl("https://cdn.example.com/a.png")).toBe("https://cdn.example.com/a.png");
    vi.stubEnv("APP_URL", "");
    expect(siteUrl()).toBe("http://localhost:3000");
    vi.stubEnv("APP_URL", "glow.example");
    expect(siteUrl()).toBe("http://localhost:3000");
  });

  it("locale mặc định (my) không có tiền tố; canonical + hreflang my/en/vi/x-default", () => {
    expect(localizedPath("my", "/")).toBe("/");
    expect(localizedPath("en", "/")).toBe("/en");
    expect(localizedPath("en", "/p/a")).toBe("/en/p/a");
    expect(localizedPath("vi", "/p/a")).toBe("/vi/p/a");
    expect(alternates("en", "/p/a")).toEqual({
      canonical: "/en/p/a",
      languages: { my: "/p/a", en: "/en/p/a", vi: "/vi/p/a", "x-default": "/p/a" },
    });
    expect(alternates("vi", "/").canonical).toBe("/vi");
  });

  it("tiền tố URL + og:locale theo locale; locale lạ → không tiền tố", () => {
    expect(localePrefix("my")).toBe("");
    expect(localePrefix("en")).toBe("/en");
    expect(localePrefix("vi")).toBe("/vi");
    expect(localePrefix("//evil.com")).toBe("");
    expect([ogLocale("my"), ogLocale("en"), ogLocale("vi")]).toEqual(["my_MM", "en_US", "vi_VN"]);
  });
});

describe("JSON-LD sản phẩm", () => {
  const p = {
    name: "Sunscreen",
    description: "Kem chống nắng",
    brand: "Sen Việt",
    images: [{ url: "/api/files/p/1.png" }],
    variants: [
      { priceMmk: 42000, available: 0 },
      { priceMmk: 25000, available: 3 },
    ],
  };
  const abs = (u: string) => `https://glow.example${u}`;

  it("giá thấp/cao MMK, còn hàng nếu có biến thể còn, ảnh tuyệt đối, có đánh giá thì có aggregateRating", () => {
    const ld = productJsonLd(p, { url: "https://glow.example/p/sun", absolute: abs, rating: { average: 4.5, count: 2 } });
    expect(ld.offers).toMatchObject({ priceCurrency: "MMK", lowPrice: 25000, highPrice: 42000, offerCount: 2, availability: "https://schema.org/InStock" });
    expect(ld.image).toEqual(["https://glow.example/api/files/p/1.png"]);
    expect(ld).toMatchObject({ aggregateRating: { ratingValue: 4.5, reviewCount: 2 } });
  });

  it("hết hàng → OutOfStock; chưa có đánh giá / ảnh / mô tả thì bỏ trường", () => {
    const ld = productJsonLd(
      { ...p, description: null, images: [], variants: [{ priceMmk: 1000, available: 0 }] },
      { url: "u", absolute: abs, rating: { average: null, count: 0 } },
    );
    expect(ld.offers.availability).toBe("https://schema.org/OutOfStock");
    expect(ld).not.toHaveProperty("aggregateRating");
    expect(ld).not.toHaveProperty("image");
    expect(ld).not.toHaveProperty("description");
  });

  it("breadcrumb đánh số từ 1; chuỗi script không đóng được thẻ </script>", () => {
    expect(breadcrumbJsonLd([{ name: "Home", url: "a" }, { name: "X", url: "b" }]).itemListElement[1]).toMatchObject({ position: 2, name: "X" });
    const s = jsonLdScript({ name: "</script><script>alert(1)</script> & co" });
    expect(s).not.toContain("<");
    expect(s).not.toContain(">");
    expect(JSON.parse(s).name).toBe("</script><script>alert(1)</script> & co");
  });
});
