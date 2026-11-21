import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// 18/11/2026: SP chưa nhập hàng → gán kho bán ngay ở bước 2 trang SP (để bán đặt trước), không phải sang danh sách "Đổi kho".
test("SP chưa nhập hàng: bước 2 có ô chọn kho bán; gán xong hết lỗi 'Chưa có kho bán'", async ({ page }) => {
  const tag = Date.now().toString(36).toUpperCase();
  await login(page, "admin@glow.local");
  await page.goto("/admin/products/new");
  const form = page.getByTestId("product-create-form");
  await form.getByRole("textbox", { name: "Tên sản phẩm", exact: true }).fill(`Đặt trước E2E ${tag}`);
  await form.getByRole("combobox", { name: "Thương hiệu", exact: true }).fill(`E2E Brand ${tag}`);
  await form.getByRole("combobox", { name: "Danh mục", exact: true }).selectOption({ index: 1 });
  await form.getByRole("button", { name: "Tạo sản phẩm", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+\?created=1$/);
  const productId = new URL(page.url()).pathname.split("/").pop()!;

  await page.goto(`/admin/products/${productId}?tab=stock`);
  const box = page.getByTestId("assign-warehouse");
  await expect(box).toBeVisible();
  await expect(page.getByTestId("issue-NO_WAREHOUSE").first()).toBeVisible();
  await page.screenshot({ path: "test-results/screens/assign-warehouse.png", fullPage: true });

  await box.getByLabel("Kho bán").selectOption({ label: "THAM — Kho Thắm" });
  await box.getByRole("button", { name: "Gán kho" }).click();
  await expect(page.getByTestId("assign-warehouse")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId("issue-NO_WAREHOUSE")).toHaveCount(0);
  // 19/11/2026: chưa nhập hàng + đặt trước đang bật (mặc định) → bước "Kho bán & hàng" xong theo nhánh bán đặt trước.
  const stepStock = page.getByTestId("product-steps").getByTestId("step-stock");
  // Không còn "Cần làm" (có thể "Có lưu ý" vì SP mới chưa có khối lượng — cảnh báo không chặn).
  await expect(stepStock).toHaveAttribute("data-state", /done|warn/);
  await expect(stepStock).toContainText("Bán đặt trước (chưa có hàng)");
  await expect(page.locator("#step-stock")).toContainText("đang bán đặt trước");
  await page.screenshot({ path: "test-results/screens/assign-warehouse-preorder.png", fullPage: true });
});

// 21/11/2026 (audit #4): chọn Kho bán + giá mua + SL dự kiến nhập ngay ở form tạo SP (tuỳ chọn, như file Excel).
test("tạo SP kèm Kho bán: bước 2 không còn ô gán kho; giá mua theo tiền của kho", async ({ page }) => {
  const tag = Date.now().toString(36).toUpperCase();
  await login(page, "admin@glow.local");
  await page.goto("/admin/products/new");
  const form = page.getByTestId("product-create-form");
  await form.getByRole("textbox", { name: "Tên sản phẩm", exact: true }).fill(`Có kho E2E ${tag}`);
  await form.getByRole("combobox", { name: "Thương hiệu", exact: true }).fill(`E2E Brand ${tag}`);
  await form.getByRole("combobox", { name: "Danh mục", exact: true }).selectOption({ index: 1 });
  const stock = form.getByTestId("create-stock");
  await stock.getByRole("combobox", { name: "Kho bán", exact: true }).selectOption({ index: 1 });
  const price = stock.getByRole("textbox", { name: /^Giá mua\/đv \((VND|MMK)\) Tiêu chuẩn$/ });
  await price.fill("12000");
  await stock.getByRole("textbox", { name: "SL dự kiến nhập Tiêu chuẩn", exact: true }).fill("4");
  await page.screenshot({ path: "test-results/screens/create-with-warehouse.png", fullPage: true });
  await form.getByRole("button", { name: "Tạo sản phẩm", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+\?created=1$/, { timeout: 15_000 });
  const productId = new URL(page.url()).pathname.split("/").pop()!;
  await page.goto(`/admin/products/${productId}?tab=stock`);
  await expect(page.getByTestId("product-steps")).toBeVisible();
  await expect(page.getByTestId("assign-warehouse")).toHaveCount(0);
  await expect(page.getByTestId("issue-NO_WAREHOUSE")).toHaveCount(0);
});
