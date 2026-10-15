import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("admin: lưu cài đặt; tính giá mới (xem trước) rồi huỷ", async ({ page }) => {
  await login(page, "admin@glow.local");

  // Lưu cài đặt giữ nguyên giá trị (không làm đổi hành vi các test khác).
  await page.goto("/admin/settings");
  await expect(page.getByLabel("Ngừng bán khi còn hạn dưới (ngày)")).toHaveValue("90");
  await page.getByRole("button", { name: "Lưu cài đặt" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Đã lưu" })).toBeVisible();

  // Ràng buộc: cảnh báo cận date phải ≥ ngừng bán.
  await page.getByLabel("Cảnh báo cận date dưới (ngày)").fill("10");
  await page.getByRole("button", { name: "Lưu cài đặt" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "expiry.warnDays" })).toBeVisible();

  await page.screenshot({ path: "test-results/screens/settings.png", fullPage: true });
  await page.goto("/admin/pricing");
  await page.getByLabel("% lãi").fill("40");
  await page.getByRole("button", { name: "Xem trước" }).click();
  await expect(page).toHaveURL(/\/admin\/pricing\/runs\//);
  await expect(page.getByRole("row", { name: /SV-SUN-50/ })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "SV-SUN-50" })).toBeChecked();
  await page.screenshot({ path: "test-results/screens/pricing-run.png", fullPage: true });

  await page.getByRole("button", { name: "Huỷ bản xem trước" }).click();
  await expect(page.getByText("Đã huỷ", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Áp dụng giá đã chọn" })).toHaveCount(0);
});
