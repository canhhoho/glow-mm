import { expect, test } from "@playwright/test";
import pg from "pg";
import { pickAddress, signInAtPrompt } from "./helpers";

const PRODUCT = "/en/p/sen-viet-sunscreen-spf50";

test.describe("Checkout A2 — Hết hàng chuyển Pre-order cần khách xác nhận lại", () => {
  test("mở checkout khi hàng có sẵn, sau đó hết hàng trong DB → báo chuyển đặt trước, xác nhận mới tạo đơn AWAITING_STOCK", async ({ page }) => {
    test.setTimeout(90_000);

    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    const v = (
      await client.query<{ id: string }>(
        `SELECT v.id FROM "Variant" v JOIN "Product" p ON v."productId" = p.id WHERE p.slug = 'sen-viet-sunscreen-spf50' LIMIT 1`,
      )
    ).rows[0].id;

    // Lấy một order bất kỳ để gắn Reservation
    const orderId = (await client.query<{ id: string }>('SELECT id FROM "Order" LIMIT 1')).rows[0].id;
    const holdId = `e2e-hold-${Date.now()}`;

    try {
      // 1. Khách thêm sản phẩm (đang có sẵn hàng) vào giỏ
      await page.goto(PRODUCT);
      await page.getByRole("button", { name: "Add to cart" }).click();
      await expect(page).toHaveURL(/\/en\/cart$/);

      // 2. Sang checkout, không có thông báo đặt trước
      await page.getByRole("button", { name: "Checkout" }).click();
      await signInAtPrompt(page);
      await expect(page).toHaveURL(/\/en\/checkout$/);
      await expect(page.getByTestId("checkout-preorder")).toHaveCount(0);

      // Điền thông tin giao hàng
      await page.getByLabel("Full name").fill("Ma Thandar");
      await page.getByLabel("Phone number").fill("0978123456");
      await pickAddress(page);
      await page.getByLabel("Address (house no., street, ward)").fill("No. 7, Pyay Road");
      await page.getByText("Cash on delivery", { exact: true }).click();

      // 3. Giữ hàng tạm trong DB để biến thể thành hết hàng có sẵn (nhưng còn hạn mức đặt trước)
      await client.query(
        `INSERT INTO "Reservation" (id, "variantId", "orderId", qty, status, "expiresAt") VALUES ($1, $2, $3, 1000000, 'ACTIVE', NULL)`,
        [holdId, v, orderId],
      );

      // 4. Khách bấm đặt hàng (form mang expectedPreorder = 0)
      await page.getByRole("button", { name: "Place order" }).click();

      // 5. Kiểm tra thông báo chuyển đặt trước xuất hiện, nút đổi thành "Confirm pre-order"
      await expect(page.getByTestId("preorder-confirm-notice")).toBeVisible();
      await expect(page.getByRole("button", { name: "Confirm pre-order" })).toBeVisible();
      // Vẫn ở trang checkout, chưa tạo đơn
      await expect(page).toHaveURL(/\/en\/checkout$/);

      // 6. Khách bấm xác nhận đặt trước
      await page.getByRole("button", { name: "Confirm pre-order" }).click();

      // 7. Tạo đơn thành công với trạng thái Waiting for stock (AWAITING_STOCK)
      await expect(page).toHaveURL(/\/en\/order\/OD-/);
      await expect(page.getByText("Thank you! Your order has been placed.")).toBeVisible();
      await expect(page.getByTestId("order-status")).toHaveText("Waiting for stock");
      await expect(page.getByTestId("order-preorder")).toBeVisible();
    } finally {
      // Xoá giữ hàng tạm
      await client.query('DELETE FROM "Reservation" WHERE id = $1', [holdId]);
      await client.end();
    }
  });
});
