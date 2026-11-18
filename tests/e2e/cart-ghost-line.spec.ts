import { expect, test } from "@playwright/test";
import { pickAddress, signInAtPrompt } from "./helpers";

// 18/11/2026 (lỗi production): giỏ (cookie) còn dòng trỏ tới biến thể ĐÃ BỊ XOÁ HẲN → trang giỏ/checkout không hiện dòng đó
// nên giỏ trông bình thường, nhưng bấm "Đặt hàng" báo "Một số sản phẩm không còn bán" (không kèm SKU). Nay dòng ma bị bỏ
// khi đặt hàng / sửa giỏ, đơn đặt được với các dòng còn lại.
const PRODUCT = "/en/p/sen-viet-sunscreen-spf50";
const GHOST = "ghostvariant0deleted01"; // đúng định dạng id cookie, không tồn tại trong DB

test("giỏ có dòng của SP đã bị xoá vẫn đặt hàng được; dòng ma bị bỏ khỏi giỏ", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(PRODUCT);
  await page.getByRole("button", { name: "Buy now" }).click();
  await signInAtPrompt(page);
  await expect(page).toHaveURL(/\/en\/checkout$/);

  const ctx = page.context();
  const cart = (await ctx.cookies()).find((c) => c.name === "cart")!;
  await ctx.addCookies([{ ...cart, value: `${cart.value},${GHOST}:2` }]);
  await page.reload();
  await expect(page.getByTestId("cart-count")).toHaveText("3"); // đếm cả dòng ma (cookie) — trước khi sửa giỏ

  await page.getByLabel("Full name").fill("Ma Ghost Cart");
  await page.getByLabel("Phone number").fill("09 4500 6611");
  await pickAddress(page);
  await page.getByLabel("Address (house no., street, ward)").fill("No. 7, Bogyoke Road");
  await page.getByText("Cash on delivery", { exact: true }).click();
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page).toHaveURL(/\/en\/order\/OD-/, { timeout: 30_000 });
  expect((await ctx.cookies()).find((c) => c.name === "cart")).toBeUndefined(); // giỏ đã xoá sau khi đặt
});

test("sửa giỏ (thêm SP) bỏ luôn dòng ma → số trên giỏ khớp các dòng hiển thị", async ({ page }) => {
  await page.goto("/en");
  await page.context().addCookies([{ name: "cart", value: `${GHOST}:2`, url: page.url() }]);
  await page.goto(PRODUCT);
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page).toHaveURL(/\/en\/cart$/);
  await expect(page.getByTestId("cart-line")).toHaveCount(1);
  await expect(page.getByTestId("cart-count")).toHaveText("1");
});
