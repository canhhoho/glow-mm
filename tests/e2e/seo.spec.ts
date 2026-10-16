import { expect, test } from "@playwright/test";

// P7: 404 có giao diện cho mọi đường dẫn lạ, metadata SEO, robots/sitemap, noindex, nút ngôn ngữ.

const PRODUCT = "/en/p/sen-viet-sunscreen-spf50";

test("đường dẫn lạ → HTTP 404 có header/footer + noindex", async ({ page }) => {
  for (const [path, title] of [
    ["/en/foo", "Page not found"],
    ["/en/p/a/b", "Page not found"],
    ["/en/cart/x", "Page not found"],
    ["/khong-co", "စာမျက်နှာ မတွေ့ပါ"],
  ]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(page.getByRole("banner")).toBeVisible(); // header storefront, không phải trang 404 trắng
    await expect(page.getByRole("contentinfo")).toBeVisible();
    await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
  }
});

test("trang SP: title template, canonical + hreflang, Open Graph, JSON-LD Product", async ({ page }) => {
  await page.goto(PRODUCT);
  await expect(page).toHaveTitle(/· Glow VN$/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/en\/p\/sen-viet-sunscreen-spf50$/);
  await expect(page.locator('link[rel="alternate"][hreflang="my"]')).toHaveAttribute("href", /\/p\/sen-viet-sunscreen-spf50$/);
  await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute("href", /\/p\/sen-viet-sunscreen-spf50$/);
  await expect(page.locator('meta[property="og:image"]').first()).toHaveAttribute("content", /^https?:\/\//);
  await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute("content", "en_US");

  const raw = await page.locator('script[type="application/ld+json"]').first().textContent();
  const [product, crumbs] = JSON.parse(raw ?? "[]");
  expect(product).toMatchObject({ "@type": "Product", name: "Sunscreen SPF50 PA++++", offers: { priceCurrency: "MMK" } });
  expect(product.offers.lowPrice).toBeLessThanOrEqual(product.offers.highPrice);
  expect(crumbs["@type"]).toBe("BreadcrumbList");
});

test("trang riêng tư có noindex; trang công khai thì không", async ({ page }) => {
  for (const path of ["/en/cart", "/en/track", "/en/search?q=a"]) {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"][content*="noindex"]').first(), path).toBeAttached();
  }
  await page.goto("/en/c/skincare");
  await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/en\/c\/skincare$/);
});

test("robots.txt + sitemap.xml", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  const r = await robots.text();
  expect(r).toContain("Disallow: /admin");
  expect(r).toContain("Disallow: /en/checkout");
  expect(r).toMatch(/Sitemap: https?:\/\/\S+\/sitemap\.xml/);

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const s = await sitemap.text();
  expect(s).toContain("/p/sen-viet-sunscreen-spf50</loc>");
  expect(s).toContain('hreflang="en"');
  expect(s).not.toContain("/cart");
});

test("nút đổi ngôn ngữ: chữ Myanmar không tràn khung", async ({ page }) => {
  await page.goto("/en");
  const sw = page.getByTestId("language-switch");
  await expect(sw).toHaveText("မြန်မာ");
  await expect(sw).toHaveAttribute("lang", "my");
  const fits = await sw.evaluate((el) => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1);
  expect(fits).toBe(true);
});
