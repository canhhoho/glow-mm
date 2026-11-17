import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";
import { createReceiptDraft, MIXED_LINES, RECEIPT_SKUS } from "./receipt-fixture";

// Trang chi tiết phiếu NHẬP: một bảng (không lặp SP ở bảng xem trước), tồn hiện tại → dự kiến tính một lần mỗi SKU × loại tồn.
async function setAdminLocale(page: Page, locale: "vi" | "en" | "my") {
  await page.context().addCookies([{ name: "ADMIN_LOCALE", value: locale, url: process.env.APP_URL! }]);
}

test("phiếu nhập nháp: một bảng, nhiều lô cùng SKU tính tồn một lần, tester có nhãn riêng, 3 trạng thái hạn", async ({ page }) => {
  const tag = String(Date.now());
  const doc = await createReceiptDraft(tag, MIXED_LINES);
  try {
    await login(page, "admin@glow.local");
    await setAdminLocale(page, "vi");
    await page.goto(`/admin/inventory/documents/${doc.id}`);

    // Một bảng: 3 nhóm (A bán được 2 lô · A tester · B), không còn bảng "Xem trước khi ghi sổ" riêng.
    const rows = page.getByTestId("receive-row");
    await expect(rows).toHaveCount(3);
    await expect(page.getByTestId("preview-row")).toHaveCount(0);
    await expect(page.getByText("Xem trước khi ghi sổ")).toHaveCount(0);

    // Cột Sản phẩm: tên trước, SKU dòng phụ (không ghép mã trước tên).
    const a = rows.nth(0);
    const nameLine = a.locator("td").first().locator("span").first();
    await expect(nameLine).toContainText("Sunscreen");
    await expect(nameLine).not.toContainText(RECEIPT_SKUS.a);
    await expect(a.locator("td").first().locator("span").nth(1)).toContainText(RECEIPT_SKUS.a);
    // Hai lô cùng SKU: hai số lô / hai hạn, tồn dự kiến tăng đúng 3 + 4 = 7, chỉ hiện một lần.
    await expect(a).toContainText(`A1-${tag}`);
    await expect(a).toContainText(`A2-${tag}`);
    await expect(a).toContainText("Chưa biết");
    await expect(a.getByTestId("receive-stock")).toHaveCount(1);
    await expect(a.getByTestId("receive-stock")).toContainText("+7");
    // Tester: dòng riêng, nhãn loại tồn từng dòng (phiếu có cả hàng bán và tester); hạn "Không áp dụng".
    await expect(page.getByTestId("doc-stock-type")).toHaveCount(0);
    await expect(rows.nth(1).getByTestId("row-stock-type")).toContainText("Tester/quà");
    await expect(rows.nth(1)).toContainText("Không áp dụng");
    await expect(rows.nth(1).getByTestId("receive-stock")).toContainText("+2");
    await expect(rows.nth(2).getByTestId("receive-stock")).toContainText("+5");
    // Giá mua đúng tiền tệ; chú thích hạn + cảnh báo nháp chưa đổi tồn, hệ thống kiểm lại khi ghi sổ.
    await expect(page.getByTestId("line-cost").first()).toContainText("95,000 VND");
    await expect(page.getByTestId("expiry-legend")).toBeVisible();
    const preview = page.getByTestId("post-preview");
    await expect(preview).toContainText("Lưu nháp chưa đổi tồn kho");
    await expect(preview).toContainText("hệ thống kiểm tra lại khi ghi sổ");
    await expect(preview.getByTestId("preview-summary")).toContainText("4 dòng");
    await page.screenshot({ path: "test-results/screens/receipt-detail-mobile-vi.png", fullPage: true });

    // EN / MY: cùng bảng, chữ theo ngôn ngữ admin.
    await setAdminLocale(page, "en");
    await page.reload();
    await expect(page.getByTestId("receive-row")).toHaveCount(3);
    await expect(page.getByTestId("receive-row").nth(0)).toContainText("Unknown");
    await expect(page.getByTestId("receive-row").nth(1)).toContainText("Not applicable");
    await setAdminLocale(page, "my");
    await page.reload();
    await expect(page.getByTestId("receive-row").nth(0)).toContainText("မသိရ");
    await page.screenshot({ path: "test-results/screens/receipt-detail-mobile-my.png", fullPage: true });
  } finally {
    await setAdminLocale(page, "vi");
    await doc.cleanup();
  }
});

test("phiếu nhập nháp một loại tồn: loại tồn hiện chung ở đầu phiếu, không lặp nhãn từng dòng", async ({ page }) => {
  const tag = String(Date.now());
  const doc = await createReceiptDraft(tag, [MIXED_LINES[0], MIXED_LINES[3]]);
  try {
    await login(page, "admin@glow.local");
    await page.goto(`/admin/inventory/documents/${doc.id}`);
    await expect(page.getByTestId("receive-row")).toHaveCount(2);
    await expect(page.getByTestId("doc-stock-type")).toHaveText("Bán được");
    await expect(page.getByTestId("row-stock-type")).toHaveCount(0);
    await expect(page.getByTestId("expiry-legend")).toHaveCount(0); // chỉ lô có ngày → không cần giải thích
  } finally {
    await doc.cleanup();
  }
});
