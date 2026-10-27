import { expect, test, type Page } from "@playwright/test";
import { signInAtPrompt } from "./helpers";

// Bố cục desktop (project "desktop", 1280×800). Mobile được các spec còn lại kiểm tra.

const PRODUCT = "/en/p/sen-viet-sunscreen-spf50";

async function box(page: Page, locator: ReturnType<Page["locator"]>) {
  await expect(locator).toBeVisible(); // nội dung stream có thể còn nằm trong khung ẩn của React
  const b = await locator.boundingBox();
  if (!b) throw new Error("không có bounding box");
  return b;
}

/** Số cột của lưới chứa thẻ sản phẩm đầu tiên. */
async function gridColumns(page: Page) {
  return page.evaluate(() => {
    const ul = document.querySelector('main a[href*="/p/"]')?.closest("ul");
    return ul ? getComputedStyle(ul).gridTemplateColumns.split(" ").length : 0;
  });
}

test("không cuộn ngang ở mọi trang chính", async ({ page }) => {
  for (const path of ["/en", "/", "/en/c/skincare", PRODUCT, "/en/cart", "/en/search?q=a", "/en/info/about", "/en/track"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test("header 2 tầng: ô tìm kiếm cùng hàng logo, nút Danh mục mở dropdown", async ({ page }) => {
  await page.goto("/en");
  const logo = await box(page, page.getByRole("link", { name: "Glow VN" }));
  const search = await box(page, page.getByRole("searchbox"));
  expect(Math.abs(search.y + search.height / 2 - (logo.y + logo.height / 2))).toBeLessThan(12);
  expect(search.x).toBeGreaterThan(logo.x + logo.width);
  await expect(page.getByRole("banner").getByRole("button", { name: "Search" })).toBeVisible();
  await expect(page.getByRole("banner").getByRole("link", { name: "Track order" })).toBeVisible();

  await page.getByLabel("Menu", { exact: true }).click();
  const nav = page.getByRole("navigation", { name: "Categories" });
  await expect(nav.getByRole("link", { name: "Skincare", exact: true })).toBeVisible();
  expect((await box(page, nav)).width).toBeLessThan(400); // dropdown, không trải hết chiều ngang

  // Danh mục có con: rê chuột → flyout bên phải (dữ liệu seed có thể chưa có danh mục con).
  const parent = nav.locator("li.group\\/item").first();
  if ((await parent.count()) > 0) {
    await parent.hover();
    const flyout = parent.locator(":scope > ul");
    await expect(flyout).toBeVisible();
    expect((await box(page, flyout)).x).toBeGreaterThanOrEqual((await box(page, parent)).x + (await box(page, parent)).width - 2);
  }
  await page.screenshot({ path: "test-results/screens/desktop-menu.png" });

  await nav.getByRole("link", { name: "Skincare", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/c\/skincare$/);
  await expect(page.getByTestId("category-menu")).not.toHaveAttribute("open");
});

test("trang chủ: dải SP 5 thẻ/hàng; danh mục: lưới 5 cột + bộ lọc luôn mở", async ({ page }) => {
  await page.goto("/en");
  await expect(page.getByRole("heading", { name: "New arrivals" })).toBeVisible();
  // Đúng 5 thẻ lấp kín khung: thẻ 5 không bị cắt, thẻ 6 (nếu có) không lộ ra.
  const rail = page.getByRole("region", { name: "New arrivals" }).locator("ul").first();
  const edges = await rail.evaluate((ul) => ({
    right: ul.getBoundingClientRect().right,
    cards: [...ul.children].map((li) => li.getBoundingClientRect()),
  }));
  expect(edges.cards.length).toBeGreaterThanOrEqual(5);
  expect(edges.cards[4].right).toBeLessThanOrEqual(edges.right + 1);
  if (edges.cards[5]) expect(edges.cards[5].left).toBeGreaterThanOrEqual(edges.right);
  // Footer: không có liên hệ (env test không đặt FB/Viber) → cột "Thông tin" dồn về mép trái, không chừa cột trống.
  const footerRow = await box(page, page.getByRole("contentinfo").locator(":scope > div"));
  const infoNav = await box(page, page.getByRole("contentinfo").getByRole("navigation"));
  expect(infoNav.x - footerRow.x).toBeLessThan(40);
  await page.screenshot({ path: "test-results/screens/desktop-home.png", fullPage: true });

  await page.goto("/en/c/skincare");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Home" })).toBeVisible();
  await expect(page.getByLabel("Sort")).toBeVisible(); // không cần bấm "Filter"
  expect(await gridColumns(page)).toBe(5);
  await page.screenshot({ path: "test-results/screens/desktop-category.png", fullPage: true });
});

test("trang SP 2 cột; Mua ngay → checkout; giỏ có cột tóm tắt bên phải", async ({ page }) => {
  await page.goto(PRODUCT);
  const img = await box(page, page.getByRole("article").locator("img, [data-testid=image-fallback]").first());
  const title = await box(page, page.getByRole("heading", { level: 1 }));
  expect(title.x).toBeGreaterThan(img.x + img.width - 2); // tên nằm bên phải ảnh
  expect(title.y).toBeLessThan(img.y + img.height);
  await page.screenshot({ path: "test-results/screens/desktop-product.png", fullPage: true });

  // Mua ngay → chưa đăng nhập → trang đăng nhập → quay lại checkout, giỏ giữ nguyên (P14c).
  await page.getByRole("button", { name: "Buy now" }).click();
  await signInAtPrompt(page);
  await expect(page).toHaveURL(/\/en\/checkout$/);
  await expect(page.getByTestId("cart-count")).toHaveText("1");

  await page.goto("/en/cart");
  const line = await box(page, page.getByTestId("cart-line").first());
  const summary = await box(page, page.getByTestId("cart-summary"));
  expect(summary.x).toBeGreaterThan(line.x + line.width - 2);
});
