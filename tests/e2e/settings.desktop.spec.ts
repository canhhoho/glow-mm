import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("cài đặt: lưu/kiểm tra dữ liệu và bố cục desktop/mobile (không còn thẻ tài khoản lặp menu)", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await login(page, "admin@glow.local");
  await page.goto("/admin/settings");
  // 20/11/2026 (audit): khối thẻ Tài khoản đã bỏ — vào Nhân viên / Khách hàng qua menu Cài đặt › Tài khoản.
  await expect(page.getByTestId("settings-accounts")).toHaveCount(0);

  // Hạn dùng đang tắt (`FEATURES.expiry`, 17/11/2026): nhóm hạn dùng ẩn; lưu cài đặt vẫn chạy (kiểm giữ ngưỡng ở pricing-settings.spec).
  await expect(page.getByLabel("Cảnh báo cận date dưới (ngày)")).toHaveCount(0);
  await page.getByRole("button", { name: "Lưu cài đặt", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Đã lưu" })).toBeVisible();
  const payment = page.getByLabel("Hướng dẫn chuyển khoản (hiện cho khách)");
  const paymentBox = await payment.boundingBox();
  const saveBox = await page.getByRole("button", { name: "Lưu cài đặt", exact: true }).boundingBox();
  expect(saveBox!.y).toBeGreaterThanOrEqual(paymentBox!.y + paymentBox!.height);
  await page.screenshot({ path: "test-results/screens/settings-redesign-desktop.png", fullPage: true, animations: "disabled" });

  await page.setViewportSize({ width: 390, height: 844 });
  const menu = page.getByRole("button", { name: "Mở menu", exact: true });
  await expect(menu).toBeVisible();
  if ((await menu.getAttribute("aria-expanded")) === "true") await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  const mobilePayment = await payment.boundingBox();
  const mobileSave = await page.getByRole("button", { name: "Lưu cài đặt", exact: true }).boundingBox();
  expect(mobileSave!.y).toBeGreaterThanOrEqual(mobilePayment!.y + mobilePayment!.height);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/screens/settings-redesign-mobile.png", fullPage: true, animations: "disabled" });
});
