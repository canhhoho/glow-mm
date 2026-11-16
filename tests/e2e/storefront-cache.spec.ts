import { expect, test } from "@playwright/test";
import pg from "pg";
import { approveChanges, livePrices, login, setPrices } from "./helpers";

// P20: nội dung SP được cache ("use cache"), tồn kho thì không. Kiểm tra admin sửa → storefront đổi ngay,
// và tồn đổi (giữ hàng) → trang SP phản ánh ngay dù nội dung đang nằm trong cache.
const SLUG = "sen-viet-sunscreen-spf50";
const CATEGORY = "/en/c/skincare";

async function db<T>(fn: (c: pg.Client) => Promise<T>) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

test("admin đổi giá biến thể → trang SP và thẻ ở trang danh mục hiện giá mới ngay", async ({ page }) => {
  test.setTimeout(90_000);
  const price = 1100 + (Date.now() % 5000); // giá lạ (5.000 khả năng, không trùng giá SP khác), thấp hơn mọi biến thể → thành giá thẻ
  const shown = `${price.toLocaleString("en-US")} MMK`;

  // Làm ấm cache trước khi sửa.
  await page.goto(`/en/p/${SLUG}`);
  await page.goto(CATEGORY);
  await expect(page.getByText(shown)).toHaveCount(0);

  await login(page, "admin@glow.local");
  await page.goto(`/admin/products?q=${SLUG}`);
  await page.getByRole("row", { name: new RegExp(SLUG) }).getByRole("link", { name: /^Sửa / }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+(?:\?from=.*)?$/);
  const adminUrl = page.url();
  // QT1b: giá sửa ở bước 3 "Giá bán" (có lý do), không còn trong form sửa.
  const [original] = await livePrices(page);

  try {
    await setPrices(page, [price]);
    // P1-A: SP đang bán → giá mới chờ duyệt; khách chỉ thấy sau khi duyệt.
    await page.goto(`/en/p/${SLUG}`);
    await expect(page.getByText(shown)).toHaveCount(0);
    await page.goto(adminUrl);
    await approveChanges(page);

    await page.goto(`/en/p/${SLUG}`);
    await expect(page.getByText(shown).first()).toBeVisible();
    await page.goto(CATEGORY);
    await expect(page.getByRole("link", { name: new RegExp(shown) }).first()).toBeVisible();
  } finally {
    await page.goto(adminUrl);
    await setPrices(page, [original]);
    await approveChanges(page);
  }
  await page.goto(`/en/p/${SLUG}`);
  await expect(page.getByText(shown)).toHaveCount(0);
});

test("tồn kho không bị cache: giữ hết hàng → trang SP báo hết hàng ngay, nhả → còn hàng lại", async ({ page }) => {
  // Chỉ xét khối chọn biến thể (thẻ "SP liên quan" bên dưới cũng có chữ "Out of stock").
  const options = page.getByRole("group", { name: "Option" });
  const available = options.getByText(/In stock|Only \d+ left/);
  await page.goto(`/en/p/${SLUG}`); // nội dung SP vào cache
  await expect(available.first()).toBeVisible();

  // Giữ hàng (Reservation) không phải bút toán kho — chèn tạm vào một đơn có sẵn rồi xoá.
  const ids = await db(async (c) => {
    const variants = (
      await c.query('SELECT v.id FROM "Variant" v JOIN "Product" p ON p.id = v."productId" WHERE p.slug = $1 AND v.active', [SLUG])
    ).rows.map((r) => r.id as string);
    // Đơn chưa có dòng giữ hàng nào cho các biến thể này (unique orderId + variantId).
    const order = (
      await c.query(
        `SELECT o.id FROM "Order" o
         WHERE NOT EXISTS (SELECT 1 FROM "Reservation" r WHERE r."orderId" = o.id AND r."variantId" = ANY($1))
         ORDER BY o."createdAt" LIMIT 1`,
        [variants],
      )
    ).rows[0].id as string;
    const tag = `e2e-cache-${Date.now()}`;
    const resIds = variants.map((_, i) => `${tag}-${i}`);
    for (const [i, v] of variants.entries()) {
      await c.query(
        `INSERT INTO "Reservation" (id, "variantId", "orderId", qty, status, "expiresAt") VALUES ($1, $2, $3, 1000000, 'ACTIVE', NULL)`,
        [resIds[i], v, order],
      );
    }
    return resIds;
  });

  try {
    await page.goto(`/en/p/${SLUG}`);
    await expect(available).toHaveCount(0);
    await expect(options.getByText("Out of stock").first()).toBeVisible();
  } finally {
    await db((c) => c.query('DELETE FROM "Reservation" WHERE id = ANY($1)', [ids]));
  }
  await page.goto(`/en/p/${SLUG}`);
  await expect(available.first()).toBeVisible();
});
