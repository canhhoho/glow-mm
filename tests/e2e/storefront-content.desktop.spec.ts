import { expect, test } from "@playwright/test";
import { adminPage, createBanner, createCollection, deleteBanners, deleteCollection } from "./content-helpers";

// P6c (desktop): mũi tên carousel, dải bộ sưu tập 5 thẻ/hàng, không cuộn ngang.

const tag = Date.now();
const ALT = `E2E desk ${tag}`;
const SLUG = `e2e-desk-${tag}`;
const NAME = `E2E desk picks ${tag}`;
let collectionUrl = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const page = await adminPage(browser, testInfo);
  await createBanner(page, `${ALT} A`, "/c/skincare");
  await createBanner(page, `${ALT} B`, "/c/makeup");
  collectionUrl = await createCollection(page, SLUG, NAME, ["sen-viet-sunscreen-spf50"]);
  await page.context().close();
});

test.afterAll(async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const page = await adminPage(browser, testInfo);
  await deleteBanners(page, ALT);
  if (collectionUrl) await deleteCollection(page, collectionUrl);
  await page.context().close();
});

test("carousel desktop: mũi tên chuyển slide; khung 3:1; dải bộ sưu tập; không cuộn ngang", async ({ page }) => {
  await page.goto("/en");
  const carousel = page.getByTestId("banner-carousel");
  await expect(carousel.getByRole("img", { name: `${ALT} A` })).toBeVisible();
  const box = await carousel.boundingBox();
  expect(Math.round(box!.width / box!.height)).toBe(3);

  const dots = carousel.getByRole("button", { name: /Show banner/ });
  await carousel.hover(); // dừng tự chuyển khi rê chuột
  await carousel.getByRole("button", { name: "Next banner" }).click();
  await expect(dots.nth(1)).toHaveAttribute("aria-current", "true");
  await carousel.getByRole("button", { name: "Previous banner" }).click();
  await expect(dots.first()).toHaveAttribute("aria-current", "true");

  await expect(page.getByRole("region", { name: NAME })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test-results/screens/home-banner-desktop.png" });
});
