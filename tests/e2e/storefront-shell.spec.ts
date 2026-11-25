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

test("mobile: không cuộn ngang; trang chủ có dải Sản phẩm mới + nhóm hàng", async ({ page }) => {
  for (const path of ["/en", "/en/c/skincare", "/en/p/sen-viet-sunscreen-spf50", "/en/cart", "/en/info/about"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  await page.goto("/en");
  await expect(page.getByRole("heading", { name: "New arrivals" })).toBeVisible();
  // G1: dải danh mục chỉ lặp SP của "Sản phẩm mới" (shop ít SP) bị ẩn — quy tắc ở tests/unit/home-rails.test.ts;
  // ô Nhóm hàng luôn có link tới danh mục.
  await expect(page.locator('section[aria-labelledby="cat-h"]').getByRole("link", { name: "Skincare" })).toBeVisible();
});

test("ô tìm kiếm trên header", async ({ page }) => {
  await page.goto("/en/cart");
  await page.getByRole("searchbox").fill("Sunscreen"); // trang giỏ chỉ có ô tìm kiếm trên header
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/en\/search\?q=Sunscreen$/);
  await expect(page.locator('a[href="/en/p/sen-viet-sunscreen-spf50"]')).toBeVisible();
});

test("footer → trang thông tin", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "ပို့ဆောင်ခြင်း" }).click();
  await expect(page).toHaveURL(/\/info\/shipping$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ပို့ဆောင်ခြင်း");

  await page.goto("/en/info/payment");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Payment");
  await expect(page.getByText("Cash on delivery (COD)")).toBeVisible();

});

test("slug sản phẩm/danh mục/trang thông tin không tồn tại → HTTP 404 thật", async ({ page, request }) => {
  for (const path of ["/en/p/khong-co", "/en/c/khong-co", "/en/info/khong-co", "/p/khong-co"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
    expect(page.url()).toMatch(new RegExp(`${path}$`)); // proxy rewrite, URL giữ nguyên
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      path.startsWith("/en") ? "Page not found" : "စာမျက်နှာ မတွေ့ပါ",
    );
    // Next chèn noindex cho cả status 404 lẫn not-found boundary → có thể 2 thẻ trùng nhau.
    await expect(page.locator('meta[name="robots"][content="noindex"]').first()).toBeAttached();
  }
  // Slug có thật vẫn 200 (cả locale mặc định không có tiền tố).
  for (const path of ["/en/p/sen-viet-sunscreen-spf50", "/p/sen-viet-sunscreen-spf50", "/en/c/skincare", "/en/info/about"]) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
});
