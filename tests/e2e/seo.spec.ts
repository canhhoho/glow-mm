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
  await expect(page).toHaveTitle(/· T&C Cosmetics$/);
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
  expect(r).toContain("Disallow: /vi/checkout");
  expect(r).toMatch(/Sitemap: https?:\/\/\S+\/sitemap\.xml/);

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const s = await sitemap.text();
  expect(s).toContain("/p/sen-viet-sunscreen-spf50</loc>");
  expect(s).toContain('hreflang="en"');
  expect(s).toContain('hreflang="vi"');
  expect(s).not.toContain("/cart");
});

// P22: menu ngôn ngữ thả xuống — Myanmar, English trước, Tiếng Việt cuối.
test("menu ngôn ngữ: 3 lựa chọn theo thứ tự, chữ Myanmar không tràn khung", async ({ page }) => {
  await page.goto("/en");
  // Next giữ trang trước (ẩn) trong DOM sau khi điều hướng → chỉ lấy phần tử đang hiện.
  const menu = page.getByTestId("language-menu").filter({ visible: true });
  await expect(menu.getByTestId("language-switch")).toHaveText("EN");
  await menu.getByTestId("language-switch").click();
  const items = menu.getByRole("link").filter({ visible: true });
  await expect(items).toHaveText(["မြန်မာ", "English", "Tiếng Việt"]);
  await expect(items.first()).toHaveAttribute("lang", "my");
  await expect(items.nth(1)).toHaveAttribute("aria-current", "true");
  const fits = await items.first().evaluate((el) => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1);
  expect(fits).toBe(true);
  await page.keyboard.press("Escape");
  await expect(items).toHaveCount(0);
});

test("đổi ngôn ngữ giữ nguyên trang đang xem (kể cả query)", async ({ page }) => {
  const menu = page.getByTestId("language-menu").filter({ visible: true });
  /** Mở menu, chờ link có href đúng (sau hydrate), rồi bấm. */
  const choose = async (name: string, href: RegExp) => {
    await menu.getByTestId("language-switch").click();
    const link = menu.getByRole("link", { name, exact: true }).filter({ visible: true });
    await expect(link).toHaveAttribute("href", href);
    await link.click();
  };

  await page.goto("/en/c/skincare");
  await choose("Tiếng Việt", /\/vi\/c\/skincare$/);
  await expect(page).toHaveURL(/\/vi\/c\/skincare$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  await expect(menu.getByTestId("language-switch")).toHaveText("VI");
  await choose("မြန်မာ", /\/c\/skincare$/); // next-intl ghi /my/... cho locale mặc định rồi chuyển về /c/...
  await expect(page).toHaveURL(/\/c\/skincare$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "my");

  await page.goto("/en/search?q=Sunscreen");
  await choose("Tiếng Việt", /\/vi\/search\?q=Sunscreen$/);
  await expect(page).toHaveURL(/\/vi\/search\?q=Sunscreen$/);
  await expect(page.locator('a[href="/vi/p/sen-viet-sunscreen-spf50"]').first()).toBeVisible();

  // E2: Đổi ngôn ngữ ở /register?next=/checkout đổi tiền tố của next sang /en/checkout
  await page.goto("/register?next=%2Fcheckout");
  await choose("English", /\/en\/register\?next=%2Fen%2Fcheckout$/);
  await expect(page).toHaveURL(/\/en\/register\?next=%2Fen%2Fcheckout$/);
});

test("trang tiếng Việt: giao diện tiếng Việt, nội dung SP chưa dịch hiện bản English", async ({ page }) => {
  await page.goto("/vi/p/sen-viet-sunscreen-spf50");
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Sunscreen SPF50 PA\+\+\+\+/);
  await expect(page.getByRole("button", { name: "Thêm vào giỏ" })).toBeVisible();
  await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute("content", "vi_VN");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/vi\/p\/sen-viet-sunscreen-spf50$/);
  await expect(page.locator('link[rel="alternate"][hreflang="vi"]')).toHaveAttribute("href", /\/vi\/p\/sen-viet-sunscreen-spf50$/);
});
