import { expect, test } from "@playwright/test";
import pg from "pg";
import { login, pickAddress, signInAtPrompt } from "./helpers";

// QT3: SP hết hàng (mặc định nhận đặt trước) → khách đặt trước → đơn "Chờ hàng về" → hàng về → admin chuyển xử lý.
// SP seed không spec nào khác dùng; "hết hàng" tạo bằng giữ hàng tạm (Reservation) rồi xoá — không đụng sổ kho.
const SLUG = "sen-viet-herbal-shampoo";
const SKU = "SV-SHA-300";

async function db<T>(fn: (c: pg.Client) => Promise<T>) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

test("khách đặt trước SP hết hàng → admin thấy ở danh sách chờ → hàng về chuyển xử lý", async ({ page }) => {
  test.setTimeout(150_000);
  const hold = `e2e-preorder-${Date.now()}`;
  await db(async (c) => {
    const v = (await c.query('SELECT id FROM "Variant" WHERE sku = $1', [SKU])).rows[0].id as string;
    const order = (
      await c.query(`SELECT o.id FROM "Order" o WHERE NOT EXISTS (SELECT 1 FROM "Reservation" r WHERE r."orderId" = o.id AND r."variantId" = $1) ORDER BY o."createdAt" LIMIT 1`, [v])
    ).rows[0].id as string;
    await c.query(`INSERT INTO "Reservation" (id, "variantId", "orderId", qty, status, "expiresAt") VALUES ($1, $2, $3, 1000000, 'ACTIVE', NULL)`, [hold, v, order]);
  });
  let released = false;
  const release = async () => {
    if (released) return;
    await db((c) => c.query('DELETE FROM "Reservation" WHERE id = $1', [hold]));
    released = true;
  };

  try {
    // Thẻ ở trang danh mục + trang SP: "Pre-order" thay "Out of stock".
    await page.goto(`/en/p/${SLUG}`);
    const options = page.getByRole("group", { name: "Option" });
    await expect(options.getByText("Out of stock · pre-order available")).toBeVisible();
    await expect(page.getByTestId("preorder-note")).toBeVisible();
    await page.getByRole("button", { name: "Pre-order", exact: true }).click();

    await signInAtPrompt(page);
    await expect(page).toHaveURL(/\/en\/checkout$/);
    await expect(page.getByTestId("checkout-preorder")).toBeVisible();
    await page.getByLabel("Full name").fill("Ma Preorder");
    await page.getByLabel("Phone number").fill("09 4500 7788");
    await pickAddress(page);
    await page.getByLabel("Address (house no., street, ward)").fill("No. 9, Pyay Road");
    await page.getByText("Cash on delivery", { exact: true }).click();
    await page.getByRole("button", { name: "Place order" }).click();
    await expect(page).toHaveURL(/\/en\/order\/OD-/, { timeout: 30_000 });
    await expect(page.getByTestId("order-status")).toHaveText("Waiting for stock");
    await expect(page.getByTestId("order-preorder")).toBeVisible();
    const code = (await page.getByTestId("order-code").textContent())!.trim();

    // Admin: đơn ở danh sách chờ, chưa đủ hàng → chưa có nút chuyển.
    await login(page, "admin@glow.local");
    await page.goto("/admin/orders/preorders");
    const card = page.getByTestId("preorder-order").filter({ hasText: code });
    await expect(card).toContainText("Chưa đủ hàng");
    await expect(card.getByRole("button", { name: "Hàng đã về — chuyển xử lý" })).toHaveCount(0);

    // Hàng về: nhả giữ hàng tạm + nhập 1 cái qua phiếu nhập (seed không có tồn SKU này) → phiếu nhắc có đơn đặt trước chờ.
    await release();
    const lot = `PO${Date.now().toString(36).toUpperCase()}`;
    await page.goto("/admin/inventory/documents/new?type=RECEIVE");
    await page.getByRole("checkbox", { name: `Chọn ${SKU}`, exact: true }).check();
    await page.getByRole("button", { name: "Tiếp tục nhập thông số", exact: true }).click();
    await page.getByLabel("Áp kho này cho tất cả").selectOption({ label: "THAM — Kho Thắm" });
    await page.getByLabel(`Số lượng ${SKU}`, { exact: true }).fill("1");
    await page.getByLabel(`Số lô ${SKU}`, { exact: true }).fill(lot);
    await page.getByLabel(`Hạn dùng ${SKU}`, { exact: true }).fill("2029-12-31");
    await page.getByLabel(`Giá mua/đv (VND) ${SKU}`, { exact: true }).fill("85000");
    await page.getByRole("button", { name: "Lưu nháp" }).click();
    await expect(page).toHaveURL(/\/admin\/inventory\/documents\/(?!new(?:\?|$))[^/?]+$/, { timeout: 30_000 });
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Ghi sổ" }).click();
    await expect(page.getByTestId("receipt-preorders")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("receipt-preorders").getByRole("link").click();
    await expect(page).toHaveURL(/\/admin\/orders\/preorders$/);
    await expect(card).toContainText("Đủ hàng");
    await card.getByRole("button", { name: "Hàng đã về — chuyển xử lý" }).click();
    await expect(page.getByTestId("preorder-order").filter({ hasText: code })).toHaveCount(0, { timeout: 15_000 });

    await page.goto(`/admin/orders?q=${code}`);
    await page.getByRole("link", { name: code }).click();
    await expect(page.getByTestId("order-status")).toContainText("Chờ xác nhận");
    await expect(page.getByTestId("order-status")).toContainText("Đặt trước");
    // Dọn: huỷ đơn (nhả giữ hàng) để không ảnh hưởng spec khác.
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Huỷ đơn" }).click();
    await expect(page.getByTestId("order-status")).toContainText("Đã huỷ");
  } finally {
    await release();
  }
});
