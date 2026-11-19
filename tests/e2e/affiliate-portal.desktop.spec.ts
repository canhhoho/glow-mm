import { expect, test } from "@playwright/test";
import { loginCtv } from "./helpers";

// Bố cục desktop cổng CTV (project "desktop"): tab ngang + ngôn ngữ + đăng xuất trên header, không có thanh đáy.

test("desktop: header có tab ngang, ngôn ngữ, đăng xuất; thanh đáy bị ẩn", async ({ page }) => {
  await loginCtv(page);
  const header = page.getByRole("banner");
  await expect(header.getByRole("link")).toHaveCount(6);
  await expect(header.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
  await expect(header.getByRole("button", { name: "MY", exact: true })).toBeVisible();
  await expect(page.getByTestId("ctv-bottom-nav")).toBeHidden();
  await expect(page.getByTestId("ctv-account-link")).toBeHidden();

  await header.getByRole("link", { name: "Đơn của tôi" }).click();
  await expect(page).toHaveURL(/\/ctv\/orders$/);
  await expect(header.getByRole("link", { name: "Đơn của tôi" })).toHaveAttribute("aria-current", "page");
});

test("desktop: header và thân trang cùng một khung; màn hình rộng không bị bó hẹp, form giữ độ rộng đọc được", async ({ page }) => {
  await loginCtv(page);
  const edges = async () => ({
    brand: Math.round((await page.locator("header > div > div").first().boundingBox())!.x),
    main: Math.round((await page.locator("main > *").first().boundingBox())!.x),
    width: Math.round((await page.locator("main").boundingBox())!.width),
  });
  for (const [w, h] of [[1366, 768], [1920, 1080], [2560, 1440]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/ctv/orders");
    const e = await edges();
    expect(e.brand, `${w}px: mép trái header = thân trang`).toBe(e.main);
    // Trước đây bị khoá 896px; nay thân trang rộng theo viewport tới trần 1536px.
    expect(e.width, `${w}px`).toBeGreaterThan(Math.min(w, 1536) - 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  }
  // Form (Tạo đơn, Tài khoản) không kéo kín màn hình.
  await page.goto("/ctv/orders/new");
  expect((await page.locator("main form").first().boundingBox())!.width).toBeLessThanOrEqual(900);
  await page.goto("/ctv/account");
  expect((await page.locator("main form").first().boundingBox())!.width).toBeLessThanOrEqual(680);
});
