import { expect, test } from "@playwright/test";
import { loginCtv } from "./helpers";

// Bố cục desktop cổng CTV (project "desktop"): tab ngang + ngôn ngữ + đăng xuất trên header, không có thanh đáy.

test("desktop: header có tab ngang, ngôn ngữ, đăng xuất; thanh đáy bị ẩn", async ({ page }) => {
  await loginCtv(page);
  const header = page.getByRole("banner");
  await expect(header.getByRole("link")).toHaveCount(6);
  await expect(header.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
  await expect(header.getByRole("button", { name: "MY", exact: true })).toBeVisible();
  await expect(page.getByTestId("ctv-bottom-nav")).toBeHidden();
  await expect(page.getByTestId("ctv-account-link")).toBeHidden();

  await header.getByRole("link", { name: "Đơn của tôi" }).click();
  await expect(page).toHaveURL(/\/ctv\/orders$/);
  await expect(header.getByRole("link", { name: "Đơn của tôi" })).toHaveAttribute("aria-current", "page");
});
