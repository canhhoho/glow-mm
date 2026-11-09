import { expect, test } from "@playwright/test";
import { login, openProductEdit, openProductSettings } from "./helpers";

// Bước 1 "Tạo sản phẩm" (QT1a): form 5 ô — tên · thương hiệu · danh mục · kho (khi > 1 kho) · phân loại. Giá đặt ở bước 3.

test("sao chép từ SP cũ: điền sẵn, không chép giá, tạo SP mới và giữ nguyên nguồn", async ({ page }) => {
  test.setTimeout(90_000);
  const sourceSlug = "sen-viet-sunscreen-spf50";
  await login(page, "admin@glow.local");
  await page.goto(`/admin/products?q=${sourceSlug}`);
  await page.getByRole("row", { name: new RegExp(sourceSlug) }).getByRole("link", { name: /^Sửa / }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+$/);
  const originalUrl = page.url();
  const sourceId = new URL(originalUrl).pathname.split("/").pop()!;
  await openProductEdit(page);
  const originalName = await page.getByRole("textbox", { name: "Tên tiếng Anh", exact: true }).inputValue();
  await openProductSettings(page);
  const originalSku = await page.getByRole("textbox", { name: "SKU", exact: true }).first().inputValue();

  await page.goto("/admin/products/new");
  // Khối sao chép đóng sẵn trên trang Tạo mới.
  await page.locator("summary").filter({ hasText: "Sao chép từ sản phẩm cũ" }).click();
  await page.getByRole("combobox", { name: "Sản phẩm nguồn", exact: true }).selectOption(sourceId);
  await page.getByRole("button", { name: "Nạp thông tin", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`copyFrom=${sourceId}`));
  const form = page.getByTestId("product-create-form");
  const name = form.getByRole("textbox", { name: "Tên sản phẩm", exact: true });
  await expect(name).toHaveValue(originalName);
  // Không còn ô giá / slug / SKU / hiển thị ở bước 1.
  await expect(form.getByRole("spinbutton")).toHaveCount(0);
  await expect(form.getByRole("checkbox")).toHaveCount(0);
  await name.fill(`Copy ${originalName}`);
  await form.getByRole("button", { name: "Tạo sản phẩm", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+\?created=1$/);
  expect(page.url().split("?")[0]).not.toBe(originalUrl.split("?")[0]);
  await expect(page.getByTestId("step-price-row").first()).toContainText("0");
  await expect(page.getByRole("textbox", { name: "Tên tiếng Anh", exact: true })).toHaveValue(`Copy ${originalName}`);

  await page.goto(originalUrl);
  await openProductEdit(page);
  await expect(page.getByRole("textbox", { name: "Tên tiếng Anh", exact: true })).toHaveValue(originalName);
  await openProductSettings(page);
  await expect(page.getByRole("textbox", { name: "SKU", exact: true }).first()).toHaveValue(originalSku);
});

test("tạo SP có phân loại: mã tự sinh, giá 0, thanh 5 bước chỉ tới Nhập kho", async ({ page }) => {
  const tag = Date.now();
  await login(page, "admin@glow.local");
  await page.goto("/admin/products/new");
  const form = page.getByTestId("product-create-form");
  await form.getByRole("textbox", { name: "Tên sản phẩm", exact: true }).fill(`Túi Đỏ Dior ${tag}`);
  await form.getByRole("combobox", { name: "Thương hiệu", exact: true }).fill(`E2E Brand ${tag}`);
  await form.getByRole("combobox", { name: "Danh mục", exact: true }).selectOption({ index: 1 });
  const labels = form.getByRole("textbox", { name: "Phân loại (màu / dung tích)", exact: true });
  await labels.fill("Đỏ");
  await labels.press("Enter");
  await labels.fill("Hồng,");
  await expect(form.getByTestId("variant-label-chip")).toHaveCount(2);
  await form.getByRole("button", { name: "Tạo sản phẩm", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+\?created=1$/);

  const steps = page.getByTestId("product-steps");
  await expect(steps.getByTestId("step-create")).toHaveAttribute("data-state", "warn"); // chưa có ảnh/mô tả
  await expect(steps.getByTestId("step-stock")).toHaveAttribute("data-state", "todo");
  await expect(steps.getByRole("link", { name: /Nhập kho/ })).toHaveAttribute("aria-current", "step");
  await expect(steps.getByTestId("step-publish")).toHaveAttribute("data-state", "waiting");
  await expect(page.getByTestId("step-price-row")).toHaveCount(2);
  await expect(page.getByTestId("step-publish-block")).toContainText("Hoàn thành các bước trước");

  await openProductSettings(page);
  await expect(page.getByRole("textbox", { name: "Slug (URL)", exact: true })).toHaveValue(`tui-do-dior-${tag}`);
  const skus = page.getByRole("textbox", { name: "SKU", exact: true });
  await expect(skus.nth(0)).toHaveValue(new RegExp(`^TUI-DO-DIOR-${tag}-0[12]$`));
  await page.screenshot({ path: "test-results/screens/product-steps.png", fullPage: true });
});

test("tạo SP chỉ với tên Myanmar (thêm tên tiếng khác) và thương hiệu gõ mới", async ({ page }) => {
  const tag = Date.now();
  await login(page, "admin@glow.local");
  await page.goto("/admin/products/new");
  const form = page.getByTestId("product-create-form");
  await form.getByRole("button", { name: "+ Thêm Tên tiếng Myanmar", exact: true }).click();
  await form.getByRole("textbox", { name: "Tên tiếng Myanmar", exact: true }).fill(`ဆပ်ပြာ ${tag}`);
  await form.getByRole("combobox", { name: "Thương hiệu", exact: true }).fill(`E2E Brand ${tag}`);
  await expect(form.getByText("Thương hiệu mới — sẽ được tạo khi lưu")).toBeVisible();
  await form.getByRole("combobox", { name: "Danh mục", exact: true }).selectOption({ index: 1 });
  await page.screenshot({ path: "test-results/screens/product-form-new.png", fullPage: true });
  await form.getByRole("button", { name: "Tạo sản phẩm", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+\?created=1$/);
  await expect(page.getByRole("status").filter({ hasText: "Đã tạo sản phẩm" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Tên tiếng Anh", exact: true })).toHaveValue(`ဆပ်ပြာ ${tag}`);
  await expect(page.getByRole("combobox", { name: "Thương hiệu", exact: true })).toHaveValue(`E2E Brand ${tag}`);
});

test("tạo combo bằng nút riêng: chọn thành phần cùng kho", async ({ page }) => {
  const tag = Date.now();
  await login(page, "admin@glow.local");
  await page.goto("/admin/products");
  await page.getByRole("link", { name: "Tạo combo", exact: true }).click();
  // Danh sách SP trên DB test tích luỹ nặng → chuyển trang có thể > 5s.
  await expect(page).toHaveURL(/\/admin\/products\/new\?type=combo$/, { timeout: 30_000 });
  const form = page.getByTestId("product-create-form");
  await form.getByRole("textbox", { name: "Tên sản phẩm", exact: true }).fill(`Bộ E2E ${tag}`);
  await form.getByRole("combobox", { name: "Thương hiệu", exact: true }).fill(`E2E Brand ${tag}`);
  await form.getByRole("combobox", { name: "Danh mục", exact: true }).selectOption({ index: 1 });
  await expect(form.getByRole("textbox", { name: "Phân loại (màu / dung tích)" })).toHaveCount(0);
  await form.getByRole("combobox", { name: "Thành phần combo 1", exact: true }).selectOption({ index: 1 });
  await form.getByRole("spinbutton", { name: "Số lượng 1", exact: true }).fill("2");
  await form.getByRole("button", { name: "Tạo combo", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+\?created=1$/, { timeout: 30_000 });
  await expect(page.getByTestId("step-price-row")).toHaveCount(1);
  await expect(page.getByTestId("product-edit").getByText("Thành phần combo", { exact: true }).first()).toBeVisible();
});
