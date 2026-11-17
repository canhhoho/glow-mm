import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

// Phiếu nhập nháp: sửa lại đúng phiếu (không tạo phiếu mới); huỷ nháp dọn lô → nhập lại cùng số lô giá khác được.
// Trang Tồn kho: SP chưa từng nhập hàng nằm ở bộ lọc riêng.
const SKU = "SV-SUN-50";

async function fillLine(page: Page, qty: string, lot: string, cost: string) {
  await page.getByLabel(`Số lượng ${SKU}`, { exact: true }).filter({ visible: true }).fill(qty);
  await page.getByLabel(`Số lô ${SKU}`, { exact: true }).filter({ visible: true }).fill(lot);
  await page.getByLabel(`Hạn dùng ${SKU}`, { exact: true }).fill("2029-12-31");
  await page.getByLabel(`Giá mua/đv (VND) ${SKU}`, { exact: true }).fill(cost);
}

async function newReceipt(page: Page) {
  await page.goto("/admin/inventory/documents/new?type=RECEIVE");
  await page.getByRole("checkbox", { name: `Chọn ${SKU}`, exact: true }).check();
  await page.getByRole("button", { name: "Tiếp tục nhập thông số", exact: true }).click();
  await page.getByLabel("Áp kho này cho tất cả").selectOption({ label: "THAM — Kho Thắm" });
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

  // Sửa: form mở lại ở bước 1 (SP của phiếu đã tích sẵn) rồi bước 2 với số đã lưu; lưu → cùng phiếu, SL mới.
  await page.getByRole("link", { name: "Sửa phiếu", exact: true }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await expect(page.getByRole("checkbox", { name: `Chọn ${SKU}`, exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Tiếp tục nhập thông số", exact: true }).click();
  await expect(page.getByLabel(`Kho ${SKU}`, { exact: true }).filter({ visible: true })).toHaveValue(/.+/);
  await expect(page.getByLabel(`Số lượng ${SKU}`, { exact: true }).filter({ visible: true })).toHaveValue("2");
  await expect(page.getByLabel(`Số lô ${SKU}`, { exact: true }).filter({ visible: true })).toHaveValue(lot);
  await page.getByLabel(`Số lượng ${SKU}`, { exact: true }).filter({ visible: true }).fill("5");
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

test("phiếu nhập: mỗi sản phẩm một kho → lưu tự tách thành hai phiếu nháp", async ({ page }) => {
  test.setTimeout(120_000);
  const lot = `SP${Date.now().toString(36).toUpperCase()}`;
  await login(page, "kho@glow.local");
  await page.goto("/admin/inventory/documents/new?type=RECEIVE");
  // Kho theo SẢN PHẨM: hai SKU thuộc hai sản phẩm khác nhau (cùng Kho Thắm trong dữ liệu seed).
  const skus = [SKU, "ML-TON-150"];
  for (const sku of skus) await page.getByRole("checkbox", { name: `Chọn ${sku}`, exact: true }).check();
  await page.getByRole("button", { name: "Tiếp tục nhập thông số", exact: true }).click();

  // SP thứ nhất vào khu chờ kiểm tra, SP thứ hai ở kho của nó (Kho Thắm) → hai phiếu.
  await page.getByLabel(`Kho ${skus[0]}`, { exact: true }).selectOption({ label: "MM-QC — Chờ kiểm tra" });
  for (const sku of skus) {
    await page.getByLabel(`Số lượng ${sku}`, { exact: true }).fill("1");
    await page.getByLabel(`Số lô ${sku}`, { exact: true }).fill(`${lot}-${sku}`);
    const expiry = page.getByLabel(`Hạn dùng ${sku}`, { exact: true });
    if (await expiry.count()) await expiry.fill("2029-12-31");
    await page.getByLabel(`Giá mua/đv (VND) ${sku}`, { exact: true }).fill("1000");
  }
  await expect(page.getByTestId("receive-split-preview")).toContainText("2 phiếu nháp");
  await page.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page).toHaveURL(/\/admin\/inventory\/documents\?status=DRAFT&split=2$/, { timeout: 30_000 });
  await expect(page.getByTestId("receive-split-notice")).toContainText("2 phiếu nháp");

  // Phiếu nhập nháp: bấm mã phiếu mở thẳng form sửa. Dọn: huỷ hai phiếu vừa tạo (hai dòng đầu danh sách nháp).
  const links = page.locator('a[href$="/edit"]').filter({ visible: true });
  const hrefs = [await links.nth(0).getAttribute("href"), await links.nth(1).getAttribute("href")].map((h) => h!.replace(/\/edit$/, ""));
  for (const href of hrefs) {
    await page.goto(href);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Huỷ phiếu" }).click();
    await expect(page.getByText("Đã huỷ", { exact: true }).filter({ visible: true })).toBeVisible();
  }
});
