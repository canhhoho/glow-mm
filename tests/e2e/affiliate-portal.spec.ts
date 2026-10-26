import { expect, test } from "@playwright/test";
import pg from "pg";
import { login, loginCtv, PASSWORD } from "./helpers";

// P10c: cổng CTV — khách đặt qua link → đơn hiện ở cổng CTV; CTV tự lên đơn; tách biệt với admin.

const VARIANT = "SV-SUN-50 — Sunscreen SPF50 PA++++ (50ml)";

async function orderIdByKey(key: string) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const r = await client.query<{ id: string }>('SELECT id FROM "Order" WHERE "idempotencyKey" = $1', [key]);
    return r.rows[0]?.id;
  } finally {
    await client.end();
  }
}

test("khách mở link CTV rồi đặt hàng → đơn hiện trong cổng CTV với hoa hồng chờ", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/en/p/sen-viet-sunscreen-spf50?ref=MAUNG");
  await expect(page).toHaveURL(/\/en\/p\/sen-viet-sunscreen-spf50$/);
  await page.getByRole("button", { name: "Add to cart" }).click();
  await page.getByRole("link", { name: "Checkout" }).click();
  await page.getByLabel("Full name").fill("Ma Ref");
  await page.getByLabel("Phone number").fill("09 7812 7777");
  await page.getByLabel("Township").selectOption({ index: 1 });
  await page.getByLabel("Address (house no., street, ward)").fill("No. 9, Inya Road");
  await page.getByText("Cash on delivery", { exact: true }).click();
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page).toHaveURL(/\/en\/order\/OD-/);
  const code = (await page.getByTestId("order-code").textContent())!.trim();

  await loginCtv(page);
  await expect(page.getByTestId("ctv-ref-link")).toHaveText(/\/\?ref=MAUNG$/);
  await page.getByRole("link", { name: "Đơn của tôi" }).click();
  const row = page.getByTestId("ctv-order").filter({ hasText: code });
  await expect(row).toContainText("Ma Ref");
  await expect(row).toContainText("Link giới thiệu");
  await expect(row).toContainText("Chờ");
  await row.click();
  await expect(page.getByTestId("ctv-order-commission")).toContainText("10%");
});

test("CTV tự lên đơn cho khách; không xem được đơn không phải của mình", async ({ page }) => {
  test.setTimeout(90_000);
  await loginCtv(page);
  await page.getByRole("link", { name: "Tạo đơn" }).click();
  await page.getByLabel("SĐT", { exact: true }).fill("09 7812 8888");
  await page.getByLabel("Tên người nhận").fill("Ko CTV Khach");
  await page.getByLabel("Khu vực").selectOption({ index: 1 });
  await page.getByLabel("Địa chỉ").fill("No. 3, Strand Rd");
  const option = page.getByLabel("Biến thể").locator("option", { hasText: VARIANT });
  await page.getByLabel("Biến thể").selectOption((await option.getAttribute("value"))!);
  await page.getByLabel("SL").fill("1");
  await page.getByRole("button", { name: "Tạo đơn" }).click();
  await expect(page).toHaveURL(/\/ctv\/orders\/[^/]+\?created=1$/);
  await expect(page.getByRole("status")).toContainText("Đã tạo đơn");
  await expect(page.getByTestId("order-status")).toContainText("Chờ xác nhận");
  await expect(page.getByTestId("ctv-order-commission")).toContainText("Chờ");

  // Đơn mẫu không gắn CTV → trang 404 trong cổng CTV, không lộ dữ liệu đơn.
  // (Cổng CTV render dạng stream sau khi kiểm tra phiên nên mã HTTP vẫn 200, giống trang admin.)
  const other = await orderIdByKey("seed-demo-5");
  await page.goto(`/ctv/orders/${other}`);
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  await expect(page.getByText("Ma Su")).toHaveCount(0);
});

test("tách cổng: CTV không vào admin, nhân viên không vào cổng CTV; cổng CTV mặc định tiếng Myanmar", async ({ page }) => {
  // Mặc định tiếng Myanmar (chưa có cookie ngôn ngữ).
  await page.context().clearCookies();
  await page.goto("/ctv/login");
  await expect(page.locator("html")).toHaveAttribute("lang", "my");

  await loginCtv(page);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
  // Đăng nhập CTV ở trang admin → báo sai cổng.
  await page.getByLabel("Email").fill("ctv@glow.local");
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "/ctv" })).toBeVisible();

  // Nhân viên vào cổng CTV → về trang đăng nhập CTV.
  await login(page, "donhang@glow.local");
  await page.goto("/ctv");
  await expect(page).toHaveURL(/\/ctv\/login$/);
});
