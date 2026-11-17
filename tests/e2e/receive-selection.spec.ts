import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("phiếu nhập hai bước: giữ dữ liệu khi quay lại, bỏ chọn không vào phiếu", async ({ page }) => {
  test.setTimeout(60_000);
  await login(page, "kho@glow.local");
  await page.goto("/admin/inventory/documents/new?type=RECEIVE");
  const picker = page.getByTestId("receive-selection");
  await expect(picker.getByRole("checkbox").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Tiếp tục nhập thông số" })).toBeDisabled();
  // Bước 1 không còn chọn kho: danh sách có đủ SP mọi kho, cột Kho cho biết kho của từng SP.
  await expect(page.getByLabel("Chọn vị trí nhận")).toHaveCount(0);
  const checkboxes = picker.getByRole("row").filter({ hasText: "Kho Thắm" }).getByRole("checkbox");
  const first = await checkboxes.nth(0).getAttribute("aria-label");
  const second = await checkboxes.nth(1).getAttribute("aria-label");
  const sku1 = first!.replace(/^Chọn /, "");
  const sku2 = second!.replace(/^Chọn /, "");
  await checkboxes.nth(0).check();
  await checkboxes.nth(1).check();
  await page.getByRole("button", { name: "Tiếp tục nhập thông số" }).click();
  await expect(page.getByLabel(`Kho ${sku1}`, { exact: true })).toHaveValue(/.+/); // SP đã có kho → kho cố định
  await expect(page.getByLabel(`Số lượng ${sku1}`, { exact: true })).toBeVisible();
  await expect(page.getByLabel(`Số lượng ${sku2}`, { exact: true })).toBeVisible();
  await page.getByLabel(`Số lượng ${sku1}`, { exact: true }).fill("3");
  await page.getByLabel(`Số lượng ${sku2}`, { exact: true }).fill("7");
  await page.getByRole("button", { name: "Quay lại chọn sản phẩm" }).click();
  await picker.getByRole("checkbox", { name: second!, exact: true }).uncheck();
  await page.getByRole("button", { name: "Tiếp tục nhập thông số" }).click();
  await expect(page.getByLabel(`Số lượng ${sku1}`, { exact: true })).toHaveValue("3");
  await expect(page.getByLabel(`Số lượng ${sku2}`, { exact: true })).toHaveCount(0);
  const lot = `SELECT-${Date.now().toString(36)}`;
  await page.getByLabel(`Số lô ${sku1}`, { exact: true }).fill(lot);
  const expiry = page.getByLabel(`Hạn dùng ${sku1}`, { exact: true });
  if (await expiry.count()) await expiry.fill("2029-12-31");
  await page.getByLabel(`Giá mua/đv (VND) ${sku1}`, { exact: true }).fill("10000");
  await page.getByRole("button", { name: "Lưu nháp", exact: true }).click();
  await expect(page).toHaveURL(/\/documents\/(?!new)[^/?]+$/);
  await expect(page.getByText(lot, { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: sku2 })).toHaveCount(0);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Huỷ phiếu" }).click();
});
