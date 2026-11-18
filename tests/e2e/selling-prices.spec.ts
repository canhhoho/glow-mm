import { expect, test } from "@playwright/test";
import pg from "pg";
import { toCsv } from "../../src/lib/csv";
import { convertVndToMmk, priceVndManual } from "../../src/server/pricing/formula";
import { login, openProductTab } from "./helpers";

// 16/11: trang Giá bán là nơi đặt giá chính — chọn SKU → Thủ công (công thức VND) / Tự động.

async function db<T>(fn: (c: pg.Client) => Promise<T>) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

test("danh sách: sửa giá trực tiếp, chọn kho và không cần bước nhập thủ công", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page, "admin@glow.local");
  await page.goto("/admin/selling-prices?q=SV-SUN-50");
  await expect(page.getByRole("heading", { name: "Giá bán", exact: true })).toBeVisible();
  const warehouse = page.getByRole("combobox", { name: "Kho", exact: true });
  const options = await warehouse.locator("option").allTextContents();
  const tham = options.find((name) => /Thắm/i.test(name));
  expect(tham).toBeTruthy();
  await warehouse.selectOption({ label: tham! });
  await expect(page).toHaveURL(/warehouse=/);
  await expect(page.getByTestId("manual-mmk")).toHaveCount(0);
  await page.getByRole("searchbox").fill("SV-SUN-50");
  await page.getByRole("button", { name: "Lọc", exact: true }).click();
  await expect(page.getByTestId("manual-row")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Nhập thủ công" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Tự động", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("manual-formula")).toHaveCount(0);
  await page.getByTestId("manual-row").getByRole("button", { name: "Sửa giá" }).click();
  await expect(page.getByRole("spinbutton", { name: /^Lãi/ })).toBeEditable();
  await page.goto("/admin/selling-prices?mode=auto");
  await expect(page).toHaveURL(/\/admin\/selling-prices\?mode=manual/);
});

test("thủ công kho VND: SP mới từ Excel → ghi sổ → Đặt giá (lô, lãi, vận chuyển, CTV) → duyệt & đăng → khách thấy đúng giá", async ({ page }) => {
  test.setTimeout(240_000);
  const suffix = Date.now();
  const name = `Manual price ${suffix}`;
  await login(page, "admin@glow.local");

  // SP mới + tồn (phiếu nháp) qua Excel, ghi sổ.
  await page.goto("/admin/products/import");
  const csv = toCsv([
    ["name_en", "brand", "category", "weight_g", "warehouse_code", "qty", "expiry_date", "unit_cost"],
    [name, "Sen Việt", "skincare", "100", "THAM", "5", "2029-12-31", "100000"],
  ]);
  await page.getByLabel("File Excel nhập sản phẩm", { exact: true }).setInputFiles({ name: `manual-${suffix}.csv`, mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Xem trước", exact: true }).click();
  await expect(page.getByTestId("catalog-import-preview")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Xác nhận nhập", exact: true }).click();
  await page.getByRole("link", { name: /kiểm tra và ghi sổ/ }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Ghi sổ", exact: true }).click();
  await expect(page.locator("span").filter({ hasText: /^Đã ghi sổ$/ }).filter({ visible: true })).toBeVisible();

  await page.goto(`/admin/products?q=${encodeURIComponent(name)}`);
  await page.getByRole("row").filter({ hasText: name }).getByRole("link", { name: /^Sửa / }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/?]+(?:\?from=.*)?$/);
  const productUrl = page.url();

  // Bước 3 → trang Giá bán thủ công.
  await openProductTab(page, "price");
  await page.getByTestId("price-actions").getByRole("link", { name: "Đặt giá" }).click();
  await expect(page).toHaveURL(/\/admin\/selling-prices\/manual\?productId=/);
  const vnd = page.getByTestId("manual-vnd");
  await expect(vnd.getByTestId("manual-formula")).toHaveCount(0);
  const line = vnd.getByTestId("manual-row").first();
  await expect(line).toContainText("100,000"); // giá mua NCC của lần nhập
  await line.getByRole("button", { name: "Sửa giá" }).click();
  await line.getByRole("spinbutton", { name: /^Lãi/ }).fill("50000");
  await line.getByRole("spinbutton", { name: /^Vận chuyển/ }).fill("800");
  await line.getByRole("spinbutton", { name: /^CTV/ }).fill("2000");

  // Đối chiếu độc lập: cùng công thức với tỷ giá đang dùng + bội số làm tròn trong DB.
  const { rate, roundTo } = await db(async (c) => {
    const r = await c.query(`SELECT "mmkPerVnd", "mmkPerUsd", "vndPerUsd" FROM "ExchangeRate" WHERE "effectiveAt" <= now() ORDER BY "effectiveAt" DESC, id DESC LIMIT 1`);
    const s = await c.query(`SELECT value FROM "Setting" WHERE key = 'pricing.roundTo'`);
    return { rate: r.rows[0], roundTo: Number(s.rows[0]?.value ?? 100) };
  });
  const expected = priceVndManual({ mmkPerVnd: rate.mmkPerVnd, mmkPerUsd: rate.mmkPerUsd, vndPerUsd: rate.vndPerUsd, purchaseVnd: 100_000, profitVnd: 50_000, shipMmk: 800, commissionMmk: 2_000, roundTo });
  const shown = expected.toLocaleString("en-US");
  await expect(line.getByTestId("manual-final")).toHaveText(shown);
  // Cột trung gian "Giá mua + lãi (MMK)" đã bỏ khỏi giao diện; giá bán vẫn đúng công thức độc lập ở trên.
  await expect(line).not.toContainText(convertVndToMmk(150_000, rate)!.toLocaleString("en-US"));
  await page.screenshot({ path: "test-results/screens/selling-prices-manual.png", fullPage: true });

  await vnd.getByRole("checkbox", { name: "Gửi duyệt ngay" }).uncheck();
  await vnd.getByRole("button", { name: /^Lưu giá/ }).click();
  await expect(vnd.getByText(/Đã áp dụng 1 giá/)).toBeVisible({ timeout: 30_000 });

  // SP chưa từng duyệt → giá + hoa hồng ghi thẳng; gửi duyệt → Duyệt & Đăng.
  await page.goto(productUrl);
  await openProductTab(page, "price");
  await expect(page.getByTestId("step-price-value").first()).toHaveText(shown);
  await expect(page.getByTestId("step-commission").first()).toContainText("2,000");
  const check = page.getByTestId("launch-check");
  await check.getByRole("button", { name: "Gửi duyệt", exact: true }).click();
  await expect(check.getByTestId("approval-status")).toHaveAttribute("data-label", "PENDING", { timeout: 15_000 });
  page.once("dialog", (d) => d.accept());
  await check.getByRole("button", { name: "Duyệt & Đăng" }).click();
  await expect(page.getByTestId("step-publish-block")).toContainText("Đang hiển thị trên web", { timeout: 15_000 });

  // Khách thấy đúng giá trên trang SP và trong giỏ.
  await page.goto(`/en/p/manual-price-${suffix}`);
  await expect(page.getByRole("main")).toContainText(`${shown} MMK`);
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page).toHaveURL(/\/en\/cart$/);
  await expect(page.getByTestId("cart-line")).toContainText(shown);

  // Dọn: ẩn SP khỏi web để không làm đầy trang chủ / danh mục của các spec khác khi chạy lại trên cùng DB.
  await page.goto(productUrl);
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("step-publish-block").getByRole("button", { name: "Ẩn khỏi web" }).click();
  await expect(page.getByTestId("step-publish-block")).toContainText("Đang ẩn khỏi web", { timeout: 15_000 });

  // 18/11/2026: tỷ giá mới → trang Giá bán có nút "Tính lại giá theo tỷ giá mới" → mọi dòng mở sẵn sửa với tỷ giá mới
  // nhất + lãi/vận chuyển/CTV lần trước → lưu → SKU không còn trong danh sách cần tính lại.
  await db(async (c) => {
    const r = await c.query(`SELECT "mmkPerUsd", "vndPerUsd", "createdById" FROM "ExchangeRate" ORDER BY "effectiveAt" DESC, id DESC LIMIT 1`);
    const { mmkPerUsd, vndPerUsd, createdById } = r.rows[0];
    const vnd = Number(vndPerUsd) + 300;
    await c.query(
      `INSERT INTO "ExchangeRate" (id, "mmkPerVnd", "mmkPerUsd", "vndPerUsd", "createdById", note) VALUES ($1, $2, $3, $4, $5, 'e2e rate-recalc')`,
      [`e2e-rate-${suffix}`, (Number(mmkPerUsd) / vnd).toFixed(6), mmkPerUsd, vnd, createdById],
    );
  });
  await page.goto("/admin/selling-prices");
  await page.getByTestId("rate-recalc").getByRole("link", { name: "Tính lại giá theo tỷ giá mới" }).click();
  await expect(page).toHaveURL(/\/admin\/selling-prices\/manual\?scope=rate$/);
  await expect(page.getByTestId("rate-recalc-notice")).toBeVisible();
  // { visible: true }: Next 16 giữ trang đã mở trước (Đặt giá ?productId=…) ẩn trong DOM → chỉ đếm phần tử đang hiện.
  const recalcRow = page.getByTestId("manual-row").filter({ hasText: name, visible: true });
  await expect(recalcRow.getByRole("spinbutton", { name: /^Lãi/ })).toHaveValue("50000"); // lãi lần trước, đang ở chế độ sửa
  await expect(recalcRow.getByRole("spinbutton", { name: /^Lãi/ })).toBeEditable();
  const recalcVnd = page.getByTestId("manual-vnd").filter({ has: recalcRow });
  const submitNow = recalcVnd.getByRole("checkbox", { name: "Gửi duyệt ngay" });
  if (await submitNow.isChecked()) await submitNow.uncheck();
  await recalcVnd.getByRole("button", { name: /^Lưu & xác nhận/ }).click();
  // Lưu xong trang tải lại danh sách cần tính lại → SKU vừa lưu biến mất (kể cả khi mở lại trang).
  await expect(page.getByTestId("manual-row").filter({ hasText: name, visible: true })).toHaveCount(0, { timeout: 30_000 });
  await page.goto("/admin/selling-prices/manual?scope=rate");
  await expect(page.getByTestId("manual-row").filter({ hasText: name, visible: true })).toHaveCount(0);
});
