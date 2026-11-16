import { expect, test } from "@playwright/test";
import { login, signInAtPrompt } from "./helpers";

test("admin: lưu cài đặt; tính giá mới (xem trước) rồi huỷ", async ({ page }) => {
  test.setTimeout(90_000); // DB test tích luỹ nhiều biến thể: bản xem trước cần thời gian tạo và render.
  await login(page, "admin@glow.local");

  // Lưu cài đặt giữ nguyên giá trị (không làm đổi hành vi các test khác).
  await page.goto("/admin/settings");
  await expect(page.getByLabel("Ngừng bán khi còn hạn dưới (ngày)")).toHaveValue("90");
  await page.getByRole("button", { name: "Lưu cài đặt" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Đã lưu" })).toBeVisible();

  // Ràng buộc: cảnh báo cận date phải ≥ ngừng bán.
  await page.getByLabel("Cảnh báo cận date dưới (ngày)").fill("10");
  await page.getByRole("button", { name: "Lưu cài đặt" }).click();
  const warnError = page.getByRole("alert").filter({ hasText: "Ngưỡng cảnh báo phải ≥ ngưỡng ngừng bán" });
  await expect(warnError).toBeVisible();
  await expect(warnError).not.toContainText("expiry."); // không lộ tên key kỹ thuật
  await expect(page.getByLabel("Cảnh báo cận date dưới (ngày)")).toHaveValue("10"); // lỗi → giữ số vừa nhập

  await page.screenshot({ path: "test-results/screens/settings.png", fullPage: true });
  // Đường dẫn cũ "Giá & tỷ giá" chuyển sang tab Tỷ giá của trang Giá bán (gộp 16/11).
  await page.goto("/admin/pricing");
  await expect(page).toHaveURL(/\/admin\/selling-prices\?mode=rates$/);
  // Tỷ giá nhập qua USD (P23); 4,420 / 26,000 = 0.17 như tỷ giá seed → không đổi giá vốn MMK ở test khác.
  await page.getByLabel("1 USD = … MMK").fill("4,420");
  await page.getByLabel("1 USD = … VND").fill("26000");
  await expect(page.getByTestId("rate-preview")).toHaveText("1 MMK = 5.8824 VND · 1 VND = 0.170000 MMK");
  await page.getByRole("button", { name: "Thêm tỷ giá" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Đã thêm tỷ giá" })).toBeVisible();
  await expect(page.getByRole("cell", { name: /1 USD = 4,420 MMK/ }).first()).toBeVisible();
  await page.screenshot({ path: "test-results/screens/selling-prices-rates.png", fullPage: true });

  // Tab "Lịch sử giá" mở được; tab "Tự động" là nơi tạo bản tính.
  await page.getByRole("link", { name: "Lịch sử giá" }).click();
  await expect(page).toHaveURL(/mode=history/);
  await page.goto("/admin/pricing?tab=runs"); // link cũ → tab Tự động
  await expect(page).toHaveURL(/\/admin\/selling-prices\?mode=auto/);
  // P24: kho mặc định = Kho Thắm (hàng nhập VN) → cần % lãi + phí ship theo kg.
  await expect(page.getByRole("combobox", { name: "Kho", exact: true })).toHaveValue(/.+/);
  await page.getByLabel("% lãi").fill("40");
  await page.getByLabel("Phí ship VN → MM (MMK/kg)").fill("8000");
  await page.getByRole("button", { name: "Xem trước" }).click();
  await expect(page).toHaveURL(/\/admin\/pricing\/runs\//, { timeout: 20_000 });
  await expect(page.getByRole("row", { name: /SV-SUN-50/ })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "SV-SUN-50" })).toBeChecked();
  // D1: nguồn giá mua (phiếu nhập đã ghi sổ + lô), trạng thái dòng, hạn bản xem trước.
  await expect(page.getByRole("columnheader", { name: "Nguồn giá mua" })).toBeVisible();
  await expect(page.getByRole("row", { name: /SV-SUN-50/ }).getByRole("link").first()).toHaveAttribute("href", /\/admin\/inventory\/documents\//);
  await expect(page.getByRole("row", { name: /SV-SUN-50/ })).toContainText("Chờ");
  await expect(page.getByText(/^Hết hạn /)).toBeVisible();
  await page.screenshot({ path: "test-results/screens/pricing-run.png", fullPage: true });

  await page.getByRole("button", { name: "Huỷ bản xem trước" }).click();
  await expect(page.getByText("Đã huỷ", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Áp dụng giá đã chọn" })).toHaveCount(0);
});

test("admin tắt nhận đơn web → trang checkout báo tạm ngừng → bật lại", async ({ page }) => {
  const toggle = async (on: boolean) => {
    await login(page, "admin@glow.local");
    await page.goto("/admin/settings");
    await page.getByLabel("Nhận đơn trên web").setChecked(on);
    await page.getByRole("button", { name: "Lưu cài đặt" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Đã lưu" })).toBeVisible();
  };

  await toggle(false);
  try {
    await page.goto("/en/p/sen-viet-sunscreen-spf50");
    await page.getByRole("button", { name: "Add to cart" }).click();
    await page.getByRole("link", { name: "Checkout" }).click();
    await signInAtPrompt(page);
    await expect(page.getByRole("alert").filter({ hasText: "temporarily not accepting online orders" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Place order" })).toHaveCount(0);
  } finally {
    await toggle(true);
  }
  // login() xoá cookie (giỏ + phiên khách) → thêm lại hàng, đăng nhập rồi kiểm tra form đặt hàng hiện lại.
  await page.goto("/en/p/sen-viet-sunscreen-spf50");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await page.getByRole("link", { name: "Checkout" }).click();
  await signInAtPrompt(page);
  await expect(page.getByRole("button", { name: "Place order" })).toBeVisible();
  // Dọn giỏ để không ảnh hưởng test khác (giỏ nằm trong cookie của context này).
  await page.context().clearCookies();
});
