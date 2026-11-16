import { expect, test } from "@playwright/test";
import pg from "pg";
import { login } from "./helpers";

// Đợt 3: chi tiết SP = đầu trang + 4 tab theo URL + điều kiện đăng bán; SP ngừng kinh doanh không có lối tắt ngõ cụt.

test("chi tiết SP: 4 tab theo URL, Quay lại về đúng danh sách đã lọc", async ({ page }) => {
  await login(page, "admin@glow.local");
  await page.goto("/admin/products?q=sen-viet-sunscreen-spf50");
  await page.getByRole("link", { name: /^Sửa / }).first().click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+\?from=/);

  const tabs = page.getByRole("navigation", { name: "Các phần của trang" });
  await expect(tabs.getByRole("link", { name: "Thông tin", exact: true })).toHaveAttribute("aria-current", "page");
  // Tab Thông tin: form sửa; chưa tải bảng giá / tồn.
  await expect(page.getByTestId("product-edit")).toBeVisible();
  await expect(page.getByTestId("step-price-row")).toHaveCount(0);

  await tabs.getByRole("link", { name: "Tồn & nhập hàng", exact: true }).click();
  await expect(page).toHaveURL(/tab=stock/);
  await expect(page.locator("#step-stock")).toBeVisible();
  await expect(page.getByTestId("step-price-row")).toHaveCount(0);

  await tabs.getByRole("link", { name: "Giá bán", exact: true }).click();
  await expect(page).toHaveURL(/tab=price/);
  await expect(page.getByTestId("step-price-row").first()).toBeVisible();

  await tabs.getByRole("link", { name: "Lịch sử", exact: true }).click();
  await expect(page).toHaveURL(/tab=history/);
  await expect(page.locator("#activity")).toBeVisible();

  // Điều kiện đăng bán luôn hiện ở mọi tab, mỗi dòng có trạng thái.
  await expect(page.getByTestId("product-steps").getByTestId("step-stock")).toHaveAttribute("data-state", /done|warn|todo|waiting/);

  // Quay lại danh sách đúng bộ lọc (tab/tìm kiếm) đã mở từ đó.
  await page.getByRole("link", { name: "Quay lại" }).first().click();
  await expect(page).toHaveURL(/\/admin\/products\?.*q=sen-viet-sunscreen-spf50/);
});

test("SP ngừng kinh doanh: banner + Khôi phục, không có Nhập hàng / đặt giá / đăng bán", async ({ page }) => {
  test.setTimeout(90_000);
  const tag = Date.now();
  await login(page, "admin@glow.local");
  await page.goto("/admin/products/new");
  const form = page.getByTestId("product-create-form");
  await form.getByRole("textbox", { name: "Tên sản phẩm", exact: true }).fill(`Lưu trữ E2E ${tag}`);
  await form.getByRole("combobox", { name: "Thương hiệu", exact: true }).fill(`E2E Brand ${tag}`);
  await form.getByRole("combobox", { name: "Danh mục", exact: true }).selectOption({ index: 1 });
  await form.getByRole("button", { name: "Tạo sản phẩm", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+\?created=1$/);
  const productId = new URL(page.url()).pathname.split("/").pop()!;

  // Đang dùng: có lối nhập hàng, có khối duyệt + đăng bán.
  await page.goto(`/admin/products/${productId}?tab=stock`);
  await expect(page.locator("#step-stock").getByRole("link", { name: "Nhập hàng" })).toBeVisible();
  await expect(page.getByTestId("launch-check")).toBeVisible();

  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    await db.query('UPDATE "Product" SET "archivedAt" = now() WHERE id = $1', [productId]);
  } finally {
    await db.end();
  }

  await page.goto(`/admin/products/${productId}?tab=stock`);
  await expect(page.getByTestId("archived-panel")).toBeVisible();
  await expect(page.locator("#step-stock").getByRole("link", { name: "Nhập hàng" })).toHaveCount(0);
  await expect(page.getByTestId("launch-check")).toHaveCount(0);
  await expect(page.getByTestId("step-publish-block")).toHaveCount(0);
  await page.getByRole("link", { name: "Giá bán", exact: true }).click();
  await expect(page.getByTestId("price-actions")).toHaveCount(0);

  // Khôi phục (không tự đăng bán) → khối duyệt / đăng bán trở lại.
  await page.getByRole("button", { name: "Khôi phục", exact: true }).first().click();
  await expect(page.getByTestId("archived-panel")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId("launch-check")).toBeVisible();
});
