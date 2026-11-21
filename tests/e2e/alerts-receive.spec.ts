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
  // Form nhập tải mọi phân loại — DB test tích luỹ nhiều SP nên có thể > 5s (như các spec phiếu kho khác).
  await expect(page).toHaveURL(/\/admin\/inventory\/documents\/new\?type=RECEIVE&pick=/, { timeout: 30_000 });
  await expect(page.getByTestId("receive-selection")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /^Đã chọn \d+ SKU$/ })).toHaveText(`Đã chọn ${n} SKU`);
  await page.getByRole("button", { name: "Tiếp tục nhập thông số", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: /^Số lượng / })).toHaveCount(n);

  // Badge tồn thấp trên mục Tồn kho (cùng số với tab Tồn thấp).
  const nav = await openAdminGroup(page, "Kho hàng");
  // Badge = tổng số tồn thấp; nút chỉ mang tối đa 200 SKU → badge ≥ số trên nút.
  const badge = nav.getByRole("link", { name: /^Tồn kho/ }).locator('[data-badge="lowStock"]');
  await expect(badge).toBeVisible();
  expect(Number((await badge.textContent())!.match(/^\d+/)![0])).toBeGreaterThanOrEqual(n);
});

test("danh sách phiếu kho: tìm theo SKU, lọc loại, bỏ lọc", async ({ page }) => {
  await login(page, "kho@glow.local");
  await page.goto("/admin/inventory/documents");
  await page.getByRole("searchbox", { name: "Tìm mã phiếu, SKU, lý do" }).fill("SV-SUN-50");
  await page.getByRole("combobox", { name: "Loại", exact: true }).selectOption({ label: "Nhập kho" });
  await page.getByRole("button", { name: "Lọc", exact: true }).click();
  await expect(page).toHaveURL(/q=SV-SUN-50/);
  await expect(page).toHaveURL(/type=RECEIVE/);
  // Điện thoại: bảng dạng thẻ, tên ô kèm nhãn cột → so theo nội dung ô (textContent).
  const typeCells = page.locator("td").filter({ hasText: /^(Nhập kho|Xuất kho|Chuyển kho|Điều chỉnh|Hàng trả)$/ });
  await expect(typeCells.first()).toBeVisible();
  expect(new Set(await typeCells.allTextContents())).toEqual(new Set(["Nhập kho"]));
  await page.getByRole("link", { name: "Bỏ lọc" }).click();
  await expect(page).toHaveURL(/\/admin\/inventory\/documents$/);
});
