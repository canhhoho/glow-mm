import { expect, test } from "@playwright/test";
import pg from "pg";
import { login, loginCtv, PASSWORD, pickAddress, pickAddressAdmin, signInAtPrompt } from "./helpers";

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
  await signInAtPrompt(page); // cookie CTV từ link vẫn còn sau khi đăng nhập
  await page.getByLabel("Full name").fill("Ma Ref");
  await page.getByLabel("Phone number").fill("09 7812 7777");
  await pickAddress(page);
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
  // 18/11/2026: hoa hồng theo mức ở Giá bán (Sunscreen mẫu 2 500 MMK/cái), không còn %.
  await expect(page.getByTestId("ctv-order-commission")).toContainText("2,500 MMK");
  await expect(page.getByTestId("ctv-order-commission")).toContainText("theo hoa hồng ở Giá bán");
});

test("CTV đăng nhập storefront bằng tài khoản CTV → đơn đặt trên web tính cho chính CTV (bỏ qua link của người khác)", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/en/p/sen-viet-sunscreen-spf50?ref=LINN");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await page.getByRole("link", { name: "Checkout" }).click();
  await signInAtPrompt(page, "ctv@glow.local", PASSWORD);
  await expect(page.getByTestId("ordering-as-affiliate")).toContainText("MAUNG");
  await page.getByLabel("Full name").fill("Ma Hộ");
  await page.getByLabel("Phone number").fill("09 7812 4545");
  await pickAddress(page);
  await page.getByLabel("Address (house no., street, ward)").fill("No. 45, Order Road");
  await page.getByText("Cash on delivery", { exact: true }).click();
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page).toHaveURL(/\/en\/order\/OD-/);
  const code = (await page.getByTestId("order-code").textContent())!.trim();

  await loginCtv(page);
  await page.getByRole("link", { name: "Đơn của tôi" }).click();
  const row = page.getByTestId("ctv-order").filter({ hasText: code });
  await expect(row).toContainText("CTV tự lên đơn");
  await row.click();
  // 18/11/2026: hoa hồng theo mức ở Giá bán (Sunscreen mẫu 2 500 MMK/cái), không còn %.
  await expect(page.getByTestId("ctv-order-commission")).toContainText("2,500 MMK");
  await expect(page.getByTestId("ctv-order-commission")).toContainText("theo hoa hồng ở Giá bán");
});

test("CTV tự lên đơn cho khách; không xem được đơn không phải của mình", async ({ page }) => {
  test.setTimeout(90_000);
  await loginCtv(page);
  await page.getByRole("link", { name: "Tạo đơn" }).click();
  await page.getByLabel("SĐT", { exact: true }).fill("09 7812 8888");
  await page.getByLabel("Tên người nhận").fill("Ko CTV Khach");
  await pickAddressAdmin(page);
  await page.getByLabel("Địa chỉ").fill("No. 3, Strand Rd");
  const option = page.getByLabel("SKU / Phân loại").locator("option", { hasText: VARIANT });
  await page.getByLabel("SKU / Phân loại").selectOption((await option.getAttribute("value"))!);
  // 18/11/2026: CTV thấy hoa hồng từng SP (mức ở Giá bán) + hoa hồng dự kiến của đơn.
  await expect(option).toContainText("Hoa hồng: 2,500");
  await expect(page.getByTestId("line-commission")).toHaveText("Hoa hồng: 2,500 MMK/cái");
  await page.getByLabel("SL", { exact: true }).fill("2");
  await expect(page.getByTestId("order-commission-estimate")).toHaveText("5,000 MMK");
  await page.getByLabel("SL", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Tạo đơn" }).click();
  await expect(page).toHaveURL(/\/ctv\/orders\/[^/]+\?created=1$/);
  // Link theo dõi gửi khách: mở ra trang Tra cứu đã điền sẵn mã đơn.
  const code = (await page.getByRole("heading", { level: 1 }).textContent())!.trim();
  const track = new URL((await page.getByTestId("ctv-track-link").textContent())!);
  expect(track.pathname + track.search).toBe(`/track?code=${code}`);
  const ctvOrderUrl = page.url();
  await page.goto(`/en/track?code=${code}`);
  await expect(page.getByLabel("Order code")).toHaveValue(code);
  await page.goto(ctvOrderUrl);
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

test("mobile: thanh mục ở đáy, Tài khoản trên header chứa ngôn ngữ + đăng xuất, không cuộn ngang", async ({ page }) => {
  await loginCtv(page);
  const bottom = page.getByTestId("ctv-bottom-nav");
  await expect(bottom.getByRole("link")).toHaveCount(5);
  // Thanh đáy nằm sát đáy màn hình, kể cả khi đã cuộn trang.
  await page.mouse.wheel(0, 2000);
  const b = (await bottom.boundingBox())!;
  expect(Math.round(b.y + b.height)).toBe(page.viewportSize()!.height);
  // Header mobile không còn ngôn ngữ / đăng xuất.
  await expect(page.getByRole("banner").getByRole("button", { name: "Đăng xuất" })).toBeHidden();

  for (const path of ["/ctv", "/ctv/orders", "/ctv/orders/new", "/ctv/team", "/ctv/payouts", "/ctv/account"]) {
    await page.goto(path);
    await expect(page.getByTestId("ctv-user")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }

  // Bộ lọc đơn: ô Tháng và ô Hoa hồng không chồng lên nhau.
  await bottom.getByRole("link", { name: "Đơn của tôi" }).click();
  await expect(page).toHaveURL(/\/ctv\/orders$/);
  const month = (await page.getByLabel("Tháng").boundingBox())!;
  const state = (await page.getByLabel("Hoa hồng").boundingBox())!;
  expect(month.x + month.width).toBeLessThanOrEqual(state.x);
  await expect(page.getByText(/^\d+ đơn · Hoa hồng:/)).toBeVisible();

  await page.getByTestId("ctv-account-link").click();
  await expect(page).toHaveURL(/\/ctv\/account$/);
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Account", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "VI", exact: true }).click();
  await page.getByRole("main").getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/\/ctv\/login$/);
});
