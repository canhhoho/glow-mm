import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// 16/11: trang Giá bán ở màn hình rộng — bảng danh sách, chọn SKU → trang thủ công (bảng công thức VND).
test("Giá bán (desktop): danh sách → chọn SKU → Nhập thủ công hiện bảng công thức và tỷ giá", async ({ page }) => {
  await login(page, "admin@glow.local");
  await page.goto("/admin/selling-prices?q=SV-SUN-50");
  const row = page.getByTestId("selling-price-row").filter({ hasText: "SV-SUN-50" }).first();
  await expect(row).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Giá mua gần nhất" })).toBeVisible();
  await page.screenshot({ path: "test-results/screens/selling-prices-list-desktop.png", fullPage: true });
  await row.getByRole("checkbox").check();
  await page.getByTestId("price-pick").getByRole("button", { name: "Nhập thủ công" }).click();
  await expect(page).toHaveURL(/\/admin\/selling-prices\/manual\?ids=/);
  const vnd = page.getByTestId("manual-vnd");
  await expect(vnd.getByRole("columnheader", { name: "Giá bán cuối (MMK)" })).toBeVisible();
  await expect(vnd.getByTestId("manual-rate").locator("option:checked")).toContainText("1 MMK =");
  await expect(vnd.getByTestId("manual-rate").locator("option:checked")).toContainText("đang dùng");
  // Điền lãi → giá cuối tự tính, không có ô sửa giá cuối.
  const line = vnd.getByTestId("manual-row").first();
  await line.getByRole("spinbutton", { name: /^Lãi mong muốn/ }).fill("30000");
  await line.getByRole("spinbutton", { name: /^Vận chuyển/ }).fill("800");
  await line.getByRole("spinbutton", { name: /^CTV/ }).fill("0");
  await expect(line.getByTestId("manual-final")).not.toHaveText("—");
  await expect(line.getByRole("spinbutton")).toHaveCount(3);
  await page.screenshot({ path: "test-results/screens/selling-prices-manual-desktop.png", fullPage: true });
});
