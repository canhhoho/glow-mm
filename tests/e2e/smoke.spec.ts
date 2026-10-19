import { expect, test } from "@playwright/test";
import { login, openAdminNav } from "./helpers";

test("storefront mặc định tiếng Myanmar, hiển thị sản phẩm từ DB", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "my");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("အရည်အသွေးစစ် အလှကုန်");
  await expect(page.getByText("နေကာခရင်မ် SPF50 PA++++").first()).toBeVisible();
  await expect(page.getByText("25,000 ကျပ်").first()).toBeVisible();
});

test("chuyển sang tiếng Anh", async ({ page }) => {
  await page.goto("/en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByText("Sunscreen SPF50 PA++++").first()).toBeVisible();
});

test("admin chưa đăng nhập → chuyển tới trang login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
});

for (const [email, roleText, canSeePricing] of [
  ["admin@glow.local", "Quản trị viên", true],
  ["kho@glow.local", "Quản lý kho", false],
  ["donhang@glow.local", "Nhân viên đơn hàng", false],
] as const) {
  test(`đăng nhập theo vai trò: ${email}`, async ({ page }) => {
    await login(page, email);
    await expect(page.getByTestId("role")).toContainText(roleText);
    await expect((await openAdminNav(page)).getByRole("link", { name: "Giá & tỷ giá" })).toHaveCount(canSeePricing ? 1 : 0);
    await page.keyboard.press("Escape"); // đóng ngăn kéo menu (mobile)

    // Đổi ngôn ngữ admin (cookie) rồi đổi lại, sau đó đăng xuất.
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await expect(page.getByTestId("role")).toContainText("Role:");
    await page.getByRole("button", { name: "VI", exact: true }).click();
    await expect(page.getByTestId("role")).toContainText(roleText);
    await page.getByRole("button", { name: "Đăng xuất" }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);
  });
}

test("sai mật khẩu → báo lỗi", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@glow.local");
  await page.getByLabel("Mật khẩu").fill("wrong-password");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByText("Sai email hoặc mật khẩu")).toBeVisible();
});

test("cron yêu cầu CRON_SECRET", async ({ request }) => {
  expect((await request.get("/api/cron/release-reservations")).status()).toBe(401);
  const ok = await request.get("/api/cron/release-reservations", {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(ok.status()).toBe(200);
});
