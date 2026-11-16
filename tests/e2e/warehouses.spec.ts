import { expect, test } from "@playwright/test";
import pg from "pg";
import { login } from "./helpers";

// P24: trang Quản lý kho — 2 kho bán + khu chờ kiểm tra; kho cũ đã ngừng; SP lọc / hiển thị theo kho.

test("admin xem kho; danh sách SP lọc theo kho; thủ kho không vào được trang kho", async ({ page }) => {
  // DB trắng của CI (chỉ seed) không có kho đã ngừng dùng → tạo một kho ngừng dùng cố định (không tồn, không chứng từ).
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    await db.query(`INSERT INTO "Location" (id, code, name, type, active) VALUES ('e2e-old-loc', 'E2E-OLD', 'Kho cũ E2E', 'VN_STOCK', false) ON CONFLICT (code) DO NOTHING`);
  } finally {
    await db.end();
  }
  await login(page, "admin@glow.local");
  await page.goto("/admin/settings/warehouses");
  await expect(page.getByRole("heading", { name: "Quản lý kho" })).toBeVisible();
  await expect(page.getByTestId("warehouse-THAM")).toContainText("Đang dùng");
  await expect(page.getByTestId("warehouse-THAM")).toContainText("Hàng nhập VN");
  await expect(page.getByTestId("warehouse-CHI")).toContainText("Kho bán");
  await expect(page.getByTestId("warehouse-MM-QC")).toContainText("Khu chờ kiểm tra");
  // Kho cũ đã ngừng dùng: ẩn mặc định, hiện khi bấm "Hiện cả … kho đã ngừng dùng".
  await expect(page.getByTestId("warehouse-VN-STOCK")).toHaveCount(0);
  await page.getByRole("link", { name: /Hiện cả \d+ kho đã ngừng dùng/ }).click();
  await expect(page).toHaveURL(/all=1/);

  // Phiếu chuyển: kho ĐI có kho ngừng dùng (dọn tồn cũ, có nhãn); kho ĐẾN và vị trí điều chỉnh thì không (server chặn).
  await page.goto("/admin/inventory/documents/new?type=TRANSFER");
  const from = page.getByLabel("Chọn vị trí xuất");
  const to = page.getByLabel("Chọn vị trí nhận");
  await expect(from.locator("option", { hasText: "E2E-OLD" })).toHaveCount(1);
  await expect(from.locator("option", { hasText: "E2E-OLD" })).toContainText("ngừng dùng");
  await expect(to.locator("option", { hasText: "E2E-OLD" })).toHaveCount(0);
  await expect(to.locator("option", { hasText: "THAM" })).toHaveCount(1);
  await page.goto("/admin/inventory/documents/new?type=ADJUST");
  await expect(page.getByLabel("Chọn vị trí", { exact: true }).locator("option", { hasText: "E2E-OLD" })).toHaveCount(0);

  await page.goto("/admin/products?q=SV-SUN-50");
  await expect(page.getByRole("row").filter({ hasText: "sen-viet-sunscreen-spf50" })).toContainText("Kho Thắm");
  await page.getByRole("combobox", { name: "Kho", exact: true }).selectOption({ label: "Kho Chi" });
  await page.getByRole("button", { name: "Lọc", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: "sen-viet-sunscreen-spf50" })).toHaveCount(0);

  await login(page, "kho@glow.local");
  await page.goto("/admin/settings/warehouses");
  await expect(page).toHaveURL(/\/admin\?denied=1$/);
});
