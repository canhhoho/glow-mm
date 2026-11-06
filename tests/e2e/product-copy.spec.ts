import { expect, test } from "@playwright/test";
import { login, openProductSettings } from "./helpers";

test("thêm sản phẩm từ bản sao, sửa trước khi lưu và giữ nguyên nguồn", async ({ page }) => {
  test.setTimeout(90_000);
  const sourceSlug = "sen-viet-sunscreen-spf50";
  const slug = `e2e-copy-${Date.now()}`;
  await login(page, "admin@glow.local");
  await page.goto(`/admin/products?q=${sourceSlug}`);
  const sourceRow = page.getByRole("row", { name: new RegExp(sourceSlug) });
  await sourceRow.getByRole("link", { name: /^Sửa / }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+$/);
  const originalUrl = page.url();
  const sourceId = new URL(originalUrl).pathname.split("/").pop()!;
  const originalName = await page.getByRole("textbox", { name: "Tên tiếng Anh", exact: true }).inputValue();
  await openProductSettings(page);
  const originalSku = await page.getByRole("textbox", { name: "SKU", exact: true }).first().inputValue();

  await page.goto("/admin/products/new");
  // Khối sao chép đóng sẵn trên trang Tạo mới.
  await page.locator("summary").filter({ hasText: "Sao chép từ sản phẩm cũ" }).click();
  const picker = page.getByRole("combobox", { name: "Sản phẩm nguồn", exact: true });
  await picker.selectOption(sourceId);
  await page.getByRole("button", { name: "Nạp thông tin", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`copyFrom=${sourceId}`));
  await openProductSettings(page);
  await expect(page.getByRole("textbox", { name: "Slug (URL)", exact: true })).toHaveValue(/^[a-z0-9-]+$/);
  await expect(page.getByRole("textbox", { name: "Tên tiếng Anh", exact: true })).toHaveValue(originalName);
  await expect(page.getByRole("checkbox", { name: "Hiển thị trên web", exact: true })).not.toBeChecked();
  const skus = page.getByRole("textbox", { name: "SKU", exact: true });
  const count = await skus.count();
  for (let i = 0; i < count; i++) {
    await expect(skus.nth(i)).toHaveValue(/^[A-Z0-9-]+$/);
    await skus.nth(i).fill(`${slug}-${i}`);
  }
  await page.getByRole("textbox", { name: "Slug (URL)", exact: true }).fill(slug);
  await page.getByRole("textbox", { name: "Tên tiếng Anh", exact: true }).fill(`Copy ${originalName}`);
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+\?saved=1$/);
  expect(page.url().split("?")[0]).not.toBe(originalUrl.split("?")[0]);
  await openProductSettings(page);
  await expect(page.getByRole("textbox", { name: "Slug (URL)", exact: true })).toHaveValue(slug);
  await expect(page.getByRole("textbox", { name: "Tên tiếng Anh", exact: true })).toHaveValue(`Copy ${originalName}`);
  await page.goto(originalUrl);
  await expect(page.getByRole("textbox", { name: "Tên tiếng Anh", exact: true })).toHaveValue(originalName);
  await openProductSettings(page);
  await expect(page.getByRole("textbox", { name: "SKU", exact: true }).first()).toHaveValue(originalSku);
});

test("tự điền mã sản phẩm mới, cho sửa tay và điền tên biến thể mặc định", async ({ page }) => {
  await login(page, "admin@glow.local");
  await page.goto("/admin/products/new");
  const name = page.getByRole("textbox", { name: "Tên tiếng Anh", exact: true });
  const slug = page.getByRole("textbox", { name: "Slug (URL)", exact: true });
  const sku = page.getByRole("textbox", { name: "SKU", exact: true }).first();
  const labels = page.getByRole("textbox", { name: "Tên biến thể (dung tích/màu)", exact: true });
  // Một biến thể: không hiện khối biến thể, giá nằm ở khối chính.
  await expect(labels).toHaveCount(0);
  await expect(page.getByRole("spinbutton", { name: "Giá (MMK)", exact: true })).toHaveCount(1);
  await openProductSettings(page);
  await name.fill("Túi Đỏ Dior");
  await expect(slug).toHaveValue("tui-do-dior");
  await expect(sku).toHaveValue("TUI-DO-DIOR-01");
  await slug.fill("my-custom-url");
  await sku.fill("MY-CODE");
  await name.fill("Prada Bag");
  await expect(slug).toHaveValue("my-custom-url");
  await expect(sku).toHaveValue("MY-CODE");
  await page.getByRole("button", { name: "+ Thêm màu/dung tích", exact: true }).click();
  await expect(labels).toHaveCount(2);
  await expect(labels.nth(1)).toHaveValue("Tiêu chuẩn");
  await expect(page.getByRole("textbox", { name: "SKU", exact: true }).nth(1)).toHaveValue("MY-CUSTOM-URL-02");
});

test("tạo SP chỉ với tên Myanmar và thương hiệu gõ mới, không cần mở Thiết lập khác", async ({ page }) => {
  const tag = Date.now();
  await login(page, "admin@glow.local");
  await page.goto("/admin/products/new");
  await page.getByRole("textbox", { name: "Tên tiếng Myanmar", exact: true }).fill(`ဆပ်ပြာ ${tag}`);
  await page.getByRole("combobox", { name: "Thương hiệu", exact: true }).fill(`E2E Brand ${tag}`);
  await expect(page.getByText("Thương hiệu mới — sẽ được tạo khi lưu")).toBeVisible();
  await page.getByRole("combobox", { name: "Danh mục", exact: true }).selectOption({ index: 1 });
  await page.getByRole("spinbutton", { name: "Giá (MMK)", exact: true }).fill("15000");
  await page.screenshot({ path: "test-results/screens/product-form-new.png", fullPage: true });
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+\?saved=1$/);
  await expect(page.getByRole("textbox", { name: "Tên tiếng Anh", exact: true })).toHaveValue(`ဆပ်ပြာ ${tag}`);
  await expect(page.getByRole("combobox", { name: "Thương hiệu", exact: true })).toHaveValue(`E2E Brand ${tag}`);
  await expect(page.getByRole("spinbutton", { name: "Giá (MMK)", exact: true })).toHaveValue("15000");
});
