import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("cài đặt: thẻ tài khoản, lưu/kiểm tra dữ liệu và bố cục desktop/mobile", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await login(page, "admin@glow.local");
  await page.goto("/admin/settings");
  const accounts = page.getByTestId("settings-accounts");
  await expect(accounts.getByRole("link")).toHaveCount(3);
  await expect(accounts.getByRole("link", { name: /^Nhân viên/ })).toHaveAttribute("href", "/admin/users");
  await expect(accounts.getByRole("link", { name: /^Cộng tác viên/ })).toHaveAttribute("href", "/admin/affiliates");
  await accounts.getByRole("link", { name: /^Khách hàng/ }).click();
  await expect(page).toHaveURL(/\/admin\/customer-accounts$/);
  await page.goto("/admin/settings");

  const block = page.getByLabel("Ngừng bán khi còn hạn dưới (ngày)");
  const warn = page.getByLabel("Cảnh báo cận date dưới (ngày)");
  const originalWarn = await warn.inputValue();
  const threshold = Number(await block.inputValue());
  await page.getByRole("button", { name: "Lưu cài đặt", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Đã lưu" })).toBeVisible();
  await warn.fill(String(threshold - 1));
  await page.getByRole("button", { name: "Lưu cài đặt", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Ngưỡng cảnh báo phải ≥ ngưỡng ngừng bán" })).toBeVisible();
  await expect(warn).toHaveValue(String(threshold - 1));
  await page.goto("/admin/settings");
  await expect(warn).toHaveValue(originalWarn);
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
