import { expect, test, type Page } from "@playwright/test";
import { login, pickAddress, signInAtPrompt } from "./helpers";

const PRODUCT = "/en/p/moc-lan-rose-toner";

async function staffStep(page: Page, email: string, orderUrl: string, button: string, fill?: Record<string, string>) {
  await login(page, email);
  await page.goto(orderUrl);
  const from = page.getByLabel("Kho xuất");
  if (button.startsWith("Đóng gói") && (await from.count())) await from.selectOption({ label: "MM-STOCK — Kho Yangon" });
  for (const [label, value] of Object.entries(fill ?? {})) await page.getByLabel(label).fill(value);
  await page.getByRole("button", { name: button }).click();
}

test("khách đánh giá sau khi nhận hàng → admin duyệt → hiện trên trang sản phẩm", async ({ page, browser }) => {
  test.setTimeout(120_000); // nhiều lần đổi vai trò nhân viên
  const comment = `Rất thích ${Date.now()}`;

  // Khách (đã đăng nhập — P14c) đặt COD; phiên khách nằm trong context của khách.
  await page.goto(PRODUCT);
  await page.getByRole("button", { name: "Add to cart" }).click();
  await page.getByRole("link", { name: "Checkout" }).click();
  await signInAtPrompt(page);
  await page.getByLabel("Full name").fill("Ma Review");
  await page.getByLabel("Phone number").fill("09 4400 5566");
  await pickAddress(page);
  await page.getByLabel("Address (house no., street, ward)").fill("No. 9, Inya Road");
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page).toHaveURL(/\/en\/order\/OD-/);
  const code = (await page.getByTestId("order-code").textContent())!.trim();
  const customerUrl = page.url().replace(/\?.*$/, "");

  // Nhân viên (context riêng để không xoá cookie của khách): xác nhận → đóng gói → giao → hoàn tất.
  const staffCtx = await browser.newContext();
  const staff = await staffCtx.newPage();
  await login(staff, "donhang@glow.local");
  await staff.goto(`/admin/orders?q=${code}`);
  await staff.getByRole("link", { name: code }).click();
  await expect(staff).toHaveURL(/\/admin\/orders\/[^/?]+$/);
  const orderUrl = staff.url();
  await staff.getByRole("button", { name: "Đã gọi xác nhận COD" }).click();
  await expect(staff.getByTestId("order-status")).toContainText("Đã xác nhận COD");
  await staffStep(staff, "kho@glow.local", orderUrl, "Đóng gói (trừ kho FEFO)");
  await expect(staff.getByTestId("order-status")).toContainText("Đang đóng gói");
  await staffStep(staff, "donhang@glow.local", orderUrl, "Giao cho vận chuyển", { "Đơn vị vận chuyển": "Royal Express" });
  await expect(staff.getByTestId("order-status")).toContainText("Đang giao");
  await staff.getByRole("button", { name: "Hoàn tất (đã giao)" }).click();
  await expect(staff.getByTestId("order-status")).toContainText("Hoàn tất");

  // Khách đánh giá 5 sao.
  await page.goto(customerUrl);
  await expect(page.getByRole("heading", { name: "Rate your products" })).toBeVisible();
  await page.getByLabel("5 stars").check({ force: true });
  await page.getByLabel("Comment (optional)").fill(comment);
  await page.getByRole("button", { name: "Send review" }).click();
  await expect(page.getByTestId("review-status")).toContainText("waiting for approval");

  // Admin duyệt.
  await login(staff, "admin@glow.local");
  await staff.goto("/admin/reviews");
  const row = staff.getByTestId("review-row").filter({ hasText: comment });
  await row.getByRole("button", { name: "Đăng" }).click();
  await expect(staff.getByTestId("review-row").filter({ hasText: comment })).toHaveCount(0);
  await staffCtx.close();

  await page.goto(PRODUCT);
  await expect(page.getByTestId("rating-summary")).toBeVisible();
  await expect(page.getByText(comment)).toBeVisible();
});

test("PWA: manifest có icon, service worker không cache, trang offline", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", /manifest\.webmanifest/);

  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ short_name: "T&C Cosmetics", display: "standalone", start_url: "/" });
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);

  const sw = await request.get("/sw.js");
  expect(sw.status()).toBe(200);
  expect(sw.headers()["cache-control"]).toContain("no-cache");
  expect((await request.get("/offline.html")).status()).toBe(200);

  // Bản production tự đăng ký service worker.
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.scope ?? "")).toMatch(/\/$/);
});
