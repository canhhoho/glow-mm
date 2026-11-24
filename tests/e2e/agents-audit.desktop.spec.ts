import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// P25 gói A — Nhật ký thao tác + Trợ lý AI trên desktop: bảng hiện đủ cột, lọc theo người "Hệ thống" không lỗi.

test("nhật ký thao tác và trang trợ lý AI hiển thị trên desktop", async ({ page }) => {
  await login(page, "admin@glow.local");
  await page.goto("/admin/settings/audit");
  await expect(page.getByRole("heading", { name: "Nhật ký thao tác" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Người thao tác" })).toBeVisible();
  await expect(page.getByTestId("audit-row").first()).toBeVisible();
  await page.screenshot({ path: "test-results/audit-desktop.png" });
  await page.getByLabel("Người thao tác").selectOption("system");
  await page.getByRole("button", { name: "Lọc" }).click();
  await expect(page).toHaveURL(/user=system/);
  await page.goto("/admin/settings/agents");
  await expect(page.getByRole("button", { name: "Tạo token" })).toBeVisible();
  await page.screenshot({ path: "test-results/agents-desktop.png" });
});
