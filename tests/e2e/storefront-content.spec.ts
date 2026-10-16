import { expect, test } from "@playwright/test";
import { adminPage, createBanner, createCollection, deleteBanners, deleteCollection } from "./content-helpers";

// P6c (mobile): banner carousel, dải + trang bộ sưu tập do admin tạo; slug bộ sưu tập lạ → 404.

const tag = Date.now();
const ALT = `E2E slide ${tag}`;
const SLUG = `e2e-home-${tag}`;
const NAME = `E2E picks ${tag}`;
let collectionUrl = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const page = await adminPage(browser, testInfo);
  await createBanner(page, `${ALT} A`, "/c/skincare");
  await createBanner(page, `${ALT} B`, "https://m.me/glow");
  collectionUrl = await createCollection(page, SLUG, NAME, ["moc-lan-rose-toner", "sen-viet-sunscreen-spf50"]);
  await page.context().close();
});

test.afterAll(async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const page = await adminPage(browser, testInfo);
  await deleteBanners(page, ALT);
  if (collectionUrl) await deleteCollection(page, collectionUrl);
  await page.context().close();
});

test("trang chủ: carousel banner (ảnh tải được, tự chuyển) + h1 vẫn có", async ({ page }) => {
  await page.goto("/en");
  const carousel = page.getByTestId("banner-carousel");
  await expect(carousel).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Quality-checked cosmetics"); // sr-only
  const first = carousel.getByRole("img", { name: `${ALT} A` });
  await expect(first).toBeVisible();
  await expect.poll(() => first.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);

  // Tự chuyển sau 5s: chấm của slide kế tiếp được đánh dấu.
  const dots = carousel.getByRole("button", { name: /Show banner/ });
  await expect(dots.first()).toHaveAttribute("aria-current", "true");
  await expect(dots.nth(1)).toHaveAttribute("aria-current", "true", { timeout: 10_000 });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test-results/screens/home-banner-mobile.png" });
});

test("bấm banner nội bộ → trang danh mục đúng ngôn ngữ", async ({ page }) => {
  await page.goto("/en");
  const carousel = page.getByTestId("banner-carousel");
  await carousel.getByRole("button", { name: "Show banner 1" }).click();
  await carousel.getByRole("link").filter({ has: page.getByRole("img", { name: `${ALT} A` }) }).click();
  await expect(page).toHaveURL(/\/en\/c\/skincare$/);
});

test("dải bộ sưu tập trên trang chủ → Xem thêm → trang bộ sưu tập theo thứ tự admin", async ({ page }) => {
  await page.goto("/en");
  const section = page.getByRole("region", { name: NAME });
  await expect(section).toBeVisible();
  await section.getByRole("link", { name: "See more" }).click();
  await expect(page).toHaveURL(new RegExp(`/en/collection/${SLUG}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(NAME);
  // Next giữ trang chủ vừa rời ẩn trong DOM → chỉ đếm thẻ đang hiện.
  const cards = page.getByRole("main").locator('a[href*="/p/"]').filter({ visible: true });
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toHaveAttribute("href", "/en/p/moc-lan-rose-toner");

  expect((await page.request.get(`/collection/${SLUG}`)).status()).toBe(200); // locale mặc định
  expect((await page.request.get("/en/collection/khong-co")).status()).toBe(404);
});
