import { expect, test } from "@playwright/test";
import pg from "pg";
import { login, pickAddress, signInAtPrompt } from "./helpers";

const SLUG = "sen-viet-herbal-shampoo";
const SKU = "SV-SHA-300";

test.describe("B2 — Đơn Pre-order chuyển khoản", () => {
  test("khách đặt trước chọn chuyển khoản → trang đơn hiện thông tin ngân hàng ngay; admin ghi nhận tiền trước → khách thấy đã nhận tiền", async ({ page, browser }) => {
    test.setTimeout(150_000);

    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    // Giữ hàng tạm để biến thể hết hàng (chuyển sang preorder)
    const hold = `e2e-b2-hold-${Date.now()}`;
    const v = (await client.query<{ id: string }>('SELECT id FROM "Variant" WHERE sku = $1', [SKU])).rows[0].id;
    const order = (
      await client.query<{ id: string }>(
        `SELECT o.id FROM "Order" o WHERE NOT EXISTS (SELECT 1 FROM "Reservation" r WHERE r."orderId" = o.id AND r."variantId" = $1) ORDER BY o."createdAt" LIMIT 1`,
        [v],
      )
    ).rows[0].id;
    await client.query(
      `INSERT INTO "Reservation" (id, "variantId", "orderId", qty, status, "expiresAt") VALUES ($1, $2, $3, 1000000, 'ACTIVE', NULL)`,
      [hold, v, order],
    );
    let placed: string | undefined;

    try {
      await page.goto(`/en/p/${SLUG}`);
      await expect(page.getByRole("button", { name: "Pre-order", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Pre-order", exact: true }).click();

      await signInAtPrompt(page);
      await expect(page).toHaveURL(/\/en\/checkout$/);
      await expect(page.getByTestId("checkout-preorder")).toBeVisible();

      await page.getByLabel("Full name").fill("Ma Preorder Bank");
      await page.getByLabel("Phone number").fill("09 4500 8899");
      await pickAddress(page);
      await page.getByLabel("Address (house no., street, ward)").fill("No. 15, Inya Road");
      await page.getByText("Bank transfer", { exact: true }).click();

      // Bấm đặt hàng
      await page.getByRole("button", { name: "Place order" }).click();

      await expect(page).toHaveURL(/\/en\/order\/OD-/, { timeout: 30_000 });
      placed = (await page.getByTestId("order-code").textContent())?.trim();
      await expect(page.getByTestId("order-status")).toHaveText("Waiting for stock");

      // Thông báo đặt trước nhắc nhở thanh toán
      const preorderNotice = page.getByTestId("order-preorder");
      await expect(preorderNotice).toBeVisible();
      await expect(preorderNotice).toContainText("You can transfer now; items arrive in 1–2 weeks.");

      // Khối thông tin ngân hàng phải hiển thị ngay cho đơn chờ hàng
      await expect(page.getByTestId("bank-instructions")).toBeVisible();
      await expect(page.getByText("No receipt is required.", { exact: false })).toBeVisible();

      // 21/11/2026: admin ghi nhận tiền trước ngay khi đơn còn chờ hàng (phiên admin riêng, giữ phiên khách).
      const adminCtx = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
      try {
        const admin = await adminCtx.newPage();
        await login(admin, "admin@glow.local");
        await admin.goto("/admin/orders/preorders");
        const card = admin.getByTestId("preorder-order").filter({ hasText: placed! });
        admin.once("dialog", (d) => d.accept());
        await card.getByRole("button", { name: "Đã nhận tiền trước" }).click();
        await expect(card.getByText("Đã trả trước", { exact: true })).toBeVisible();
        await expect(card.getByRole("button", { name: "Đã nhận tiền trước" })).toHaveCount(0);
        await admin.screenshot({ path: "test-results/screens/preorder-prepaid-admin.png", fullPage: true });
      } finally {
        await adminCtx.close();
      }

      await page.reload();
      await expect(page.getByTestId("order-status")).toHaveText("Waiting for stock");
      await expect(page.getByTestId("order-preorder")).toContainText("we have received your transfer");
      await expect(page.getByTestId("bank-instructions")).toHaveCount(0);
    } finally {
      // Dọn: đơn chờ hàng (không giữ hàng, chưa xuất kho) → huỷ để không chiếm hàng đợi đặt trước của spec khác.
      if (placed) await client.query(`UPDATE "Order" SET status = 'CANCELLED' WHERE code = $1 AND status = 'AWAITING_STOCK'`, [placed]);
      await client.query('DELETE FROM "Reservation" WHERE id = $1', [hold]);
      await client.end();
    }
  });
});
