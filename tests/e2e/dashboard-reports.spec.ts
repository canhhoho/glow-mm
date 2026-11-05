import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("dashboard (admin) + báo cáo có số liệu từ đơn mẫu seed", async ({ page }) => {
  await login(page, "admin@glow.local");
  await expect(page.getByRole("heading", { name: "Việc cần làm" })).toBeVisible();
  await expect(page.getByTestId("todo-cod")).toBeVisible();
  await expect(page.getByTestId("alert-low")).not.toContainText(/^0$/);
  await expect(page.getByTestId("month-revenue")).toBeVisible();
  await page.screenshot({ path: "test-results/screens/dashboard.png", fullPage: true });

  await page.getByRole("link", { name: "Xem báo cáo" }).click();
  await expect(page.getByRole("heading", { name: "Báo cáo" })).toBeVisible();
  // Seed có đơn mẫu hoàn tất trong 30 ngày → doanh thu > 0.
  await expect(page.getByTestId("r-orders")).not.toContainText(/\b0$/);
  await expect(page.getByTestId("stock-THAM")).toBeVisible();
  await page.screenshot({ path: "test-results/screens/reports.png", fullPage: true });
});

test("nhân viên đơn hàng thấy việc cần làm nhưng không thấy số tiền", async ({ page }) => {
  await login(page, "donhang@glow.local");
  await expect(page.getByTestId("todo-cod")).toBeVisible();
  await expect(page.getByTestId("month-revenue")).toHaveCount(0);
  await page.goto("/admin/reports");
  await expect(page).toHaveURL(/\/admin\?denied=1/);
});
