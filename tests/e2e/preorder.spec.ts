import { expect, test } from "@playwright/test";
import pg from "pg";
import { login, pickAddress, pickAddressAdmin, signInAtPrompt } from "./helpers";

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
    // SP một loại: không có ô chọn, hiện tình trạng hàng trong khối giá (17/11/2026).
    await expect(page.getByTestId("single-variant").getByText("Out of stock · pre-order available")).toBeVisible();
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

// 18/11/2026: hiển thị đặt trước ở mọi nơi khách thấy — thẻ danh sách, trang SP, giỏ — và SP TẮT đặt trước thì là "Hết hàng".
test("hết hàng: thẻ + trang SP + giỏ hiện đặt trước; tắt đặt trước → Hết hàng, không mua được", async ({ page }) => {
  test.setTimeout(90_000);
  const hold = `e2e-preorder-ui-${Date.now()}`;
  await db(async (c) => {
    const v = (await c.query('SELECT id FROM "Variant" WHERE sku = $1', [SKU])).rows[0].id as string;
    const order = (await c.query('SELECT id FROM "Order" ORDER BY "createdAt" LIMIT 1')).rows[0].id as string;
    await c.query(`INSERT INTO "Reservation" (id, "variantId", "orderId", qty, status, "expiresAt") VALUES ($1, $2, $3, 1000000, 'ACTIVE', NULL)`, [hold, v, order]);
  });
  const setPreorder = (on: boolean) => db((c) => c.query('UPDATE "Product" SET "preorderEnabled" = $1 WHERE slug = $2', [on, SLUG]));
  try {
    const card = page.locator("li").filter({ has: page.locator(`a[href="/en/p/${SLUG}"]`) });
    await page.goto("/en/search?q=Herbal%20Shampoo");
    await expect(card.getByTestId("card-preorder")).toHaveText("Pre-order");

    await page.goto(`/en/p/${SLUG}`);
    await expect(page.getByRole("button", { name: "Pre-order", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Add to cart" }).click();
    await expect(page).toHaveURL(/\/en\/cart$/);
    await expect(page.getByTestId("cart-preorder")).toBeVisible();
    await expect(page.getByText(/whole order ships once everything is in stock/)).toBeVisible();

    await setPreorder(false);
    await page.goto("/en/search?q=Herbal%20Shampoo");
    await expect(card.getByTestId("card-preorder")).toHaveCount(0);
    await expect(card.getByText("Out of stock").first()).toBeVisible();
    await page.goto(`/en/p/${SLUG}`);
    await expect(page.getByTestId("single-variant").getByText("Out of stock", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add to cart" })).toHaveCount(0);
    await expect(page.getByTestId("preorder-note")).toHaveCount(0);
  } finally {
    await setPreorder(true);
    await db((c) => c.query('DELETE FROM "Reservation" WHERE id = $1', [hold]));
  }
});

test("nhân viên tạo đơn tay cho SP hết hàng → chọn được hàng đặt trước, đơn thành Chờ hàng về (19/11/2026)", async ({ page }) => {
  test.setTimeout(120_000);
  const hold = `e2e-preorder-staff-${Date.now()}`;
  await db(async (c) => {
    const v = (await c.query('SELECT id FROM "Variant" WHERE sku = $1', [SKU])).rows[0].id as string;
    const order = (
      await c.query(`SELECT o.id FROM "Order" o WHERE NOT EXISTS (SELECT 1 FROM "Reservation" r WHERE r."orderId" = o.id AND r."variantId" = $1) ORDER BY o."createdAt" LIMIT 1`, [v])
    ).rows[0].id as string;
    await c.query(`INSERT INTO "Reservation" (id, "variantId", "orderId", qty, status, "expiresAt") VALUES ($1, $2, $3, 1000000, 'ACTIVE', NULL)`, [hold, v, order]);
  });
  try {
    await login(page, "donhang@glow.local");
    await page.goto("/admin/orders/new?phone=09%207812%209900");
    await page.getByLabel("Tên người nhận").fill("Ma Pre Order");
    await pickAddressAdmin(page);
    await page.getByLabel("Địa chỉ").fill("No. 9, Pre Order St");
    const select = page.getByLabel("SKU / Phân loại");
    const option = select.locator("option", { hasText: SKU });
    await expect(option).toBeEnabled();
    await expect(option).toContainText("Đặt trước: còn nhận");
    await select.selectOption((await option.getAttribute("value"))!);
    await expect(page.getByTestId("line-preorder")).toContainText("đơn đặt trước");
    await page.getByLabel("SL", { exact: true }).fill("1");
    await page.getByRole("button", { name: "Tạo đơn" }).click();
    await expect(page).toHaveURL(/\/admin\/orders\/[^/]+$/);
    await expect(page.getByText("Chờ hàng về").filter({ visible: true }).first()).toBeVisible();
  } finally {
    await db((c) => c.query('DELETE FROM "Reservation" WHERE id = $1', [hold]));
  }
});
