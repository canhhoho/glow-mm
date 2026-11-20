import { expect, test } from "@playwright/test";
import { login, openAdminGroup } from "./helpers";

// Đợt 2 audit (20/11/2026): Cảnh báo → phiếu nhập chọn sẵn SKU; badge tồn thấp trên menu Tồn kho; danh sách phiếu kho tìm / lọc.
test("cảnh báo tồn thấp → Tạo phiếu nhập chọn sẵn SKU; menu Tồn kho có badge tồn thấp", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page, "kho@glow.local");
  await page.goto("/admin/alerts?tab=low");
  const button = page.getByTestId("alerts-receive").getByRole("link", { name: /^Tạo phiếu nhập/ });
  await expect(button).toBeVisible();
  const n = Number((await button.textContent())!.match(/\((\d+)/)![1]);
  expect(n).toBeGreaterThan(0);
  await button.click();
  await expect(page).toHaveURL(/\/admin\/inventory\/documents\/new\?type=RECEIVE&pick=/);
  await expect(page.getByTestId("receive-selection")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /^Đã chọn \d+ SKU$/ })).toHaveText(`Đã chọn ${n} SKU`);
  await page.getByRole("button", { name: "Tiếp tục nhập thông số", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: /^Số lượng / })).toHaveCount(n);

  // Badge tồn thấp trên mục Tồn kho (cùng số với tab Tồn thấp).
  const nav = await openAdminGroup(page, "Kho hàng");
  await expect(nav.getByRole("link", { name: /^Tồn kho/ }).locator('[data-badge="lowStock"]')).toHaveText(new RegExp(`^${n}`));
});

test("danh sách phiếu kho: tìm theo SKU, lọc loại, bỏ lọc", async ({ page }) => {
  await login(page, "kho@glow.local");
  await page.goto("/admin/inventory/documents");
  await page.getByRole("searchbox", { name: "Tìm mã phiếu, SKU, lý do" }).fill("SV-SUN-50");
  await page.getByRole("combobox", { name: "Loại", exact: true }).selectOption({ label: "Nhập kho" });
  await page.getByRole("button", { name: "Lọc", exact: true }).click();
  await expect(page).toHaveURL(/q=SV-SUN-50/);
  await expect(page).toHaveURL(/type=RECEIVE/);
  await expect(page.getByRole("cell", { name: "Nhập kho", exact: true }).first()).toBeVisible();
  for (const other of ["Xuất kho", "Chuyển kho", "Điều chỉnh"]) await expect(page.getByRole("cell", { name: other, exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Bỏ lọc" }).click();
  await expect(page).toHaveURL(/\/admin\/inventory\/documents$/);
});
