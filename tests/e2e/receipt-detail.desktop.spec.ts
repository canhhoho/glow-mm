import { expect, test } from "@playwright/test";
import { login } from "./helpers";
import { createReceiptDraft, MIXED_LINES } from "./receipt-fixture";

// Desktop: phiếu nhập nháp là MỘT bảng với đủ cột theo thứ tự; số căn phải.
test("desktop: phiếu nhập nháp một bảng, cột Sản phẩm · Số lô · Hạn dùng · SL nhập · Giá mua · Tồn hiện tại → Dự kiến", async ({ page }) => {
  const tag = String(Date.now());
  const doc = await createReceiptDraft(tag, MIXED_LINES);
  try {
    await login(page, "admin@glow.local");
    await page.goto(`/admin/inventory/documents/${doc.id}`);
    await expect(page.locator("table")).toHaveCount(1);
    await expect(page.locator("thead th")).toHaveText(["Sản phẩm", "Số lô", "Hạn dùng", "Số lượng nhập", "Giá mua/đv", "Tồn hiện tại → Dự kiến"]);
    const qty = page.getByTestId("receive-row").first().locator("td").nth(3);
    await expect(qty).toHaveCSS("text-align", "right");
    await page.screenshot({ path: "test-results/screens/receipt-detail-desktop.png", fullPage: true });
  } finally {
    await doc.cleanup();
  }
});
