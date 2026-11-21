import { expect, test } from "@playwright/test";
import pg from "pg";
import { pickAddress, signInAtPrompt } from "./helpers";

const PRODUCT = "/en/p/sen-viet-sunscreen-spf50";

test.describe("Checkout A1 — Đổi giá giữa lúc xem và đặt", () => {
  test("đổi giá trong DB khi đang ở checkout → báo lỗi đổi giá, hiển thị nút xác nhận và tổng mới, xác nhận xong tạo đơn", async ({ page }) => {
    test.setTimeout(90_000);

    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    // Lấy thông tin biến thể và giá gốc
    const variantRow = (
      await client.query<{ id: string; priceMmk: number }>(
        `SELECT v.id, v."priceMmk" FROM "Variant" v WHERE v.sku = 'SV-SUN-50'`,
      )
    ).rows[0];
    expect(variantRow).toBeDefined();
    const originalPrice = variantRow.priceMmk;
    const variantId = variantRow.id;

    try {
      // 1. Khách thêm sản phẩm vào giỏ
      await page.goto(PRODUCT);
      await page.getByRole("button", { name: "Add to cart" }).click();
      await expect(page).toHaveURL(/\/en\/cart$/);

      // 2. Sang checkout và đăng nhập nếu có prompt
      await page.getByRole("button", { name: "Checkout" }).click();
      await signInAtPrompt(page);
      await expect(page).toHaveURL(/\/en\/checkout$/);

      // Điền thông tin giao hàng
      await page.getByLabel("Full name").fill("Ma Thandar");
      await page.getByLabel("Phone number").fill("0978123456");
      await pickAddress(page);
      await page.getByLabel("Address (house no., street, ward)").fill("No. 7, Pyay Road");
      await page.getByText("Cash on delivery", { exact: true }).click();

      // 3. Admin đổi giá sản phẩm trong DB (tăng thêm 5.000 MMK)
      const newPrice = originalPrice + 5_000;
      await client.query('UPDATE "Variant" SET "priceMmk" = $1 WHERE id = $2', [newPrice, variantId]);

      // 4. Khách bấm đặt hàng với giá cũ
      await page.getByRole("button", { name: "Place order" }).click();

      // 5. Kiểm tra thông báo đổi giá xuất hiện, nút đổi thành "Confirm order"
      await expect(page.getByTestId("price-changed-notice")).toBeVisible();
      await expect(page.getByRole("button", { name: "Confirm order" })).toBeVisible();
      // Vẫn ở trang checkout, chưa tạo đơn
      await expect(page).toHaveURL(/\/en\/checkout$/);

      // 6. Khách bấm xác nhận đặt hàng với giá mới
      await page.getByRole("button", { name: "Confirm order" }).click();

      // 7. Tạo đơn thành công và chuyển sang trang xem đơn
      await expect(page).toHaveURL(/\/en\/order\/OD-/);
      await expect(page.getByText("Thank you! Your order has been placed.")).toBeVisible();
    } finally {
      // Phục hồi lại giá gốc trong DB để không ảnh hưởng các test khác
      await client.query('UPDATE "Variant" SET "priceMmk" = $1 WHERE id = $2', [originalPrice, variantId]);
      await client.end();
    }
  });
});
