import { expect, test } from "@playwright/test";
import { signInAtPrompt } from "./helpers";

// Audit storefront bước 1: số lượng vừa gõ ở giỏ mà chưa bấm "Cập nhật" không được mất khi bấm "Checkout".
const PRODUCT = "/en/p/sen-viet-sunscreen-spf50";

test("Checkout lưu số lượng đang nhập (chưa bấm Cập nhật) rồi mới sang thanh toán", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(PRODUCT);
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page).toHaveURL(/\/en\/cart$/);
  const qty = page.getByTestId("cart-line").first().getByRole("spinbutton");
  await qty.fill("3");
  await page.getByRole("button", { name: "Checkout" }).click();
  await signInAtPrompt(page);
  await expect(page).toHaveURL(/\/en\/checkout$/);
  await page.goto("/en/cart");
  await expect(page.getByTestId("cart-line").first().getByRole("spinbutton")).toHaveValue("3");
});

test("ô số lượng trống không làm mất dòng; nút Update chỉ lưu, Enter không nhảy sang thanh toán", async ({ page }) => {
  await page.goto(PRODUCT);
  await page.getByRole("button", { name: "Add to cart" }).click();
  const qty = page.getByTestId("cart-line").first().getByRole("spinbutton");
  await qty.fill("");
  await qty.press("Enter");
  await expect(page).toHaveURL(/\/en\/cart$/);
  await expect(page.getByTestId("cart-line")).toHaveCount(1);
  await expect(page.getByTestId("cart-line").first().getByRole("spinbutton")).toHaveValue("1");
  await page.getByTestId("cart-line").first().getByRole("spinbutton").fill("2");
  await page.getByRole("button", { name: "Update" }).click();
  await expect(page.getByTestId("cart-line").first().getByRole("spinbutton")).toHaveValue("2");
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByTestId("cart-line")).toHaveCount(0);
});
