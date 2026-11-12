import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("giá bán: tìm SKU, sửa giá tại bảng và mở tính tự động", async ({ page }) => {
  await login(page, "admin@glow.local");
  await page.goto("/admin/selling-prices");
  await expect(page.getByRole("heading", { name: "Giá bán", exact: true })).toBeVisible();
  const row = page.getByTestId("selling-price-row").first();
  const sku = await row.locator("td").nth(1).locator("span").innerText();
  await page.getByRole("searchbox").fill(sku);
  await page.getByRole("button", { name: "Lọc", exact: true }).click();
  await expect(row).toContainText(sku);
  await row.locator("summary").click();
  const price = row.getByRole("spinbutton");
  const oldPrice = await price.inputValue();
  const newPrice = String(Math.max(1, Number(oldPrice)) + 100);
  await price.fill(newPrice);
  await row.getByRole("textbox", { name: "Lý do sửa giá" }).fill("Kiểm tra bảng giá");
  await row.getByRole("button", { name: "Lưu giá", exact: true }).click();
  await expect(row.getByRole("status")).toHaveText("Đã lưu giá bán");
  await page.reload();
  await row.locator("summary").click();
  await expect(price).toHaveValue(newPrice);
  if (Number(oldPrice) > 0) {
    await price.fill(oldPrice);
    await row.getByRole("textbox", { name: "Lý do sửa giá" }).fill("Khôi phục sau kiểm tra");
    await row.getByRole("button", { name: "Lưu giá", exact: true }).click();
    await expect(row.getByRole("status")).toBeVisible();
  }
  await page.getByRole("link", { name: "Tự động tính", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tính giá mới (xem trước)", exact: true })).toBeVisible();
});
