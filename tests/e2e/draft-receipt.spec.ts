import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

// Phiếu nhập nháp: sửa lại đúng phiếu (không tạo phiếu mới); huỷ nháp dọn lô → nhập lại cùng số lô giá khác được.
// Trang Tồn kho: SP chưa từng nhập hàng nằm ở bộ lọc riêng.
const SKU = "SV-SUN-50";

async function fillLine(page: Page, qty: string, lot: string, cost: string) {
  await page.getByLabel(`Số lượng ${SKU}`, { exact: true }).fill(qty);
  await page.getByLabel(`Số lô ${SKU}`, { exact: true }).fill(lot);
  await page.getByLabel(`Hạn dùng ${SKU}`, { exact: true }).fill("2029-12-31");
  await page.getByLabel(`Giá mua/đv (VND) ${SKU}`, { exact: true }).fill(cost);
}

async function newReceipt(page: Page) {
  await page.goto("/admin/inventory/documents/new?type=RECEIVE");
  await page.getByLabel("Chọn vị trí nhận").selectOption({ label: "THAM — Kho Thắm" });
  await page.getByRole("checkbox", { name: `Chọn ${SKU}`, exact: true }).check();
  await page.getByRole("button", { name: "Tiếp tục nhập thông số", exact: true }).click();
}

async function cancelDraft(page: Page) {
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Huỷ phiếu" }).click();
  await expect(page.getByText("Đã huỷ", { exact: true }).filter({ visible: true })).toBeVisible();
}

test("sửa phiếu nhập nháp giữ nguyên phiếu; huỷ nháp rồi nhập lại cùng số lô với giá khác", async ({ page }) => {
  test.setTimeout(120_000);
  const lot = `DR${Date.now().toString(36).toUpperCase()}`;
  await login(page, "kho@glow.local");
  await newReceipt(page);
  await fillLine(page, "2", lot, "90000");
  await page.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page).toHaveURL(/\/admin\/inventory\/documents\/(?!new(?:\?|$))[^/?]+$/, { timeout: 30_000 });
  const docUrl = page.url();

  // Sửa: form mở lại ở bước 2 với số đã lưu; lưu → cùng phiếu, SL mới.
  await page.getByRole("link", { name: "Sửa phiếu", exact: true }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await expect(page.getByLabel(`Số lượng ${SKU}`, { exact: true })).toHaveValue("2");
  await expect(page.getByLabel(`Số lô ${SKU}`, { exact: true })).toHaveValue(lot);
  await page.getByLabel(`Số lượng ${SKU}`, { exact: true }).fill("5");
  await page.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page).toHaveURL(`${docUrl}?updated=1`, { timeout: 30_000 });
  await expect(page.getByText("Đã cập nhật phiếu nháp.")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: lot }).filter({ visible: true })).toContainText("5");

  // Huỷ nháp → lô nháp bị dọn → nhập lại cùng số lô với giá khác không bị chặn.
  await cancelDraft(page);
  await newReceipt(page);
  await fillLine(page, "1", lot, "80000");
  await page.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page).toHaveURL(/\/admin\/inventory\/documents\/(?!new(?:\?|$))[^/?]+$/, { timeout: 30_000 });
  expect(page.url()).not.toBe(docUrl);
  await cancelDraft(page);
});

test("Tồn kho: SP chưa từng nhập hàng tách sang bộ lọc riêng", async ({ page }) => {
  await login(page, "kho@glow.local");
  await page.goto("/admin/inventory");
  const link = page.getByTestId("not-received-link");
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/received=no/);
  await expect(page.getByRole("link", { name: "← Xem SP đã nhập hàng" })).toBeVisible();
});
