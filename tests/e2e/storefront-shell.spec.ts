import { expect, test } from "@playwright/test";

test("menu danh mục 2 cấp: chỉ hiện nhánh có SP, tự đóng khi chuyển trang", async ({ page }) => {
  await page.goto("/en");
  const menu = page.getByTestId("category-menu");
  await page.getByLabel("Menu", { exact: true }).click();
  const nav = page.getByRole("navigation", { name: "Categories" });
  await expect(nav.getByRole("link", { name: "Skincare", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Body care" })).toHaveCount(0); // danh mục chưa có SP
  await page.screenshot({ path: "test-results/screens/store-menu.png" });

  await nav.getByRole("link", { name: "Skincare", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/c\/skincare$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Skincare");
  await expect(menu).not.toHaveAttribute("open");
});

test("ô tìm kiếm trên header", async ({ page }) => {
  await page.goto("/en/cart");
  await page.getByRole("searchbox").fill("Sunscreen"); // trang giỏ chỉ có ô tìm kiếm trên header
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/en\/search\?q=Sunscreen$/);
  await expect(page.locator('a[href="/en/p/sen-viet-sunscreen-spf50"]')).toBeVisible();
});

test("footer → trang thông tin; slug lạ → 404", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "ပို့ဆောင်ခြင်း" }).click();
  await expect(page).toHaveURL(/\/info\/shipping$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ပို့ဆောင်ခြင်း");

  await page.goto("/en/info/payment");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Payment");
  await expect(page.getByText("Cash on delivery (COD)")).toBeVisible();

  // Cache Components gửi static shell (HTTP 200) trước khi notFound() chạy → kiểm tra trang 404 + noindex.
  await page.goto("/en/info/khong-co");
  await expect(page.getByText("Page not found")).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
});
