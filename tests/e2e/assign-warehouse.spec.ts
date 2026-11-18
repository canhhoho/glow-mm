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
});
