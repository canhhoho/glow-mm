import { expect, test } from "@playwright/test";
import { login, PASSWORD } from "./helpers";

const EMAIL = "donhang@glow.local";
const NEW_PASSWORD = "Doi-mat-khau-E2E-2026";

async function changePassword(page: import("@playwright/test").Page, current: string, next: string, confirm = next) {
  await page.goto("/admin/account");
  await page.getByLabel("Mật khẩu hiện tại").fill(current);
  await page.getByLabel("Mật khẩu mới", { exact: true }).fill(next);
  await page.getByLabel("Nhập lại mật khẩu mới").fill(confirm);
  await page.getByRole("button", { name: "Đổi mật khẩu" }).click();
}

test("nhân viên tự đổi mật khẩu → đăng nhập bằng mật khẩu mới → đổi lại", async ({ page }) => {
  await login(page, EMAIL);
  await page.getByRole("link", { name: "Ma Thida (Đơn hàng)" }).click();
  await expect(page).toHaveURL(/\/admin\/account$/);

  // Sai mật khẩu hiện tại / nhập lại không khớp → báo lỗi, không đổi.
  await changePassword(page, "sai-mat-khau-hien-tai", NEW_PASSWORD);
  await expect(page.getByRole("alert").filter({ hasText: "Mật khẩu hiện tại không đúng" })).toBeVisible();
  await changePassword(page, PASSWORD, NEW_PASSWORD, NEW_PASSWORD + "x");
  await expect(page.getByRole("alert").filter({ hasText: "không khớp" })).toBeVisible();

  try {
    await changePassword(page, PASSWORD, NEW_PASSWORD);
    await expect(page.getByRole("status").filter({ hasText: "Đã đổi mật khẩu" })).toBeVisible();
    // Phiên hiện tại vẫn dùng được sau khi đổi (các phiên khác bị thu hồi).
    await page.goto("/admin");
    await expect(page.getByTestId("role")).toBeVisible();

    await page.context().clearCookies();
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Mật khẩu").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(page.getByTestId("role")).toBeVisible();
  } finally {
    // Trả lại mật khẩu seed cho các test khác.
    await changePassword(page, NEW_PASSWORD, PASSWORD);
    await expect(page.getByRole("status").filter({ hasText: "Đã đổi mật khẩu" })).toBeVisible();
  }
  await login(page, EMAIL);
});
