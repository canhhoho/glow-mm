import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// P24: trang Quản lý kho — 2 kho bán + khu chờ kiểm tra; kho cũ đã ngừng; SP lọc / hiển thị theo kho.

test("admin xem kho; danh sách SP lọc theo kho; thủ kho không vào được trang kho", async ({ page }) => {
  await login(page, "admin@glow.local");
  await page.goto("/admin/settings/warehouses");
  await expect(page.getByRole("heading", { name: "Kho hàng" })).toBeVisible();
  await expect(page.getByTestId("warehouse-THAM")).toContainText("Đang dùng");
  await expect(page.getByTestId("warehouse-THAM")).toContainText("Hàng nhập VN");
  await expect(page.getByTestId("warehouse-CHI")).toContainText("Kho bán");
  await expect(page.getByTestId("warehouse-MM-QC")).toContainText("Khu chờ kiểm tra");
  // Kho cũ đã ngừng dùng: ẩn mặc định, hiện khi bấm "Hiện cả … kho đã ngừng dùng".
  await expect(page.getByTestId("warehouse-VN-STOCK")).toHaveCount(0);
  await page.getByRole("link", { name: /Hiện cả \d+ kho đã ngừng dùng/ }).click();
  await expect(page).toHaveURL(/all=1/);

  await page.goto("/admin/products?q=SV-SUN-50");
  await expect(page.getByRole("row").filter({ hasText: "sen-viet-sunscreen-spf50" })).toContainText("Kho Thắm");
  await page.getByRole("combobox", { name: "Kho", exact: true }).selectOption({ label: "Kho Chi" });
  await page.getByRole("button", { name: "Lọc", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: "sen-viet-sunscreen-spf50" })).toHaveCount(0);

  await login(page, "kho@glow.local");
  await page.goto("/admin/settings/warehouses");
  await expect(page).toHaveURL(/\/admin\?denied=1$/);
});
