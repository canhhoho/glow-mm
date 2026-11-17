import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("Giá bán (desktop): bảng theo kho và quy đổi ngầm ngay trên danh sách", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page, "admin@glow.local");
  await page.goto("/admin/selling-prices?q=SV-SUN-50");
  const vnd = page.getByTestId("manual-vnd");
  for (const name of ["Giá mua (VNĐ)", "Lãi (VNĐ)", "Giá mua (MMK)", "Vận chuyển (MMK)", "CTV (MMK)", "Giá bán (MMK)", "Thao tác"]) {
    await expect(vnd.getByRole("columnheader", { name, exact: true })).toBeVisible();
  }
  await expect(page.getByTestId("price-pick")).toHaveCount(0);
  await expect(page.getByTestId("manual-formula")).toHaveCount(0);
  const line = vnd.getByTestId("manual-row").first();
  await line.getByRole("button", { name: "Sửa giá" }).click();
  await line.getByRole("spinbutton", { name: /^Lãi/ }).fill("30000");
  await line.getByRole("spinbutton", { name: /^Vận chuyển/ }).fill("800");
  await line.getByRole("spinbutton", { name: /^CTV/ }).fill("0");
  await expect(line.getByTestId("manual-final")).not.toHaveText("—");
  await expect(line.getByRole("spinbutton")).toHaveCount(3);
  await expect(page).toHaveURL(/selling-prices\?q=/);
  await page.screenshot({ path: "test-results/screens/selling-prices-manual-desktop.png", fullPage: true });
});
