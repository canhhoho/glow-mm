import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

// P17: khách đăng ký / đăng nhập bằng SĐT + mật khẩu (không OTP); admin đặt lại mật khẩu khi khách quên.

const PASSWORD = "e2e-phone-pass-1";
const hello = (page: Page) => page.getByTestId("account-hello").filter({ visible: true });

/** SĐT ngẫu nhiên 09 + 9 chữ số; trả cả dạng gõ có khoảng trắng / +95. */
function randomPhone() {
  const digits = String(100_000_000 + Math.floor(Math.random() * 900_000_000));
  return { normalized: `09${digits}`, typed: `+95 9 ${digits.slice(0, 4)} ${digits.slice(4)}` };
}

async function phoneLogin(page: Page, phone: string, password: string) {
  await page.goto("/en/login?next=%2Fen%2Faccount");
  await page.getByLabel("Email or phone number").fill(phone);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("đăng ký bằng SĐT → vào tài khoản; checkout điền sẵn SĐT; đăng xuất → đăng nhập lại bằng SĐT", async ({ page }) => {
  const phone = randomPhone();
  await page.goto("/en/register?next=%2Fen%2Faccount");
  const form = page.locator("form").filter({ has: page.getByLabel("Phone number") });
  await form.getByLabel("Full name").fill("Ma Phone");
  await form.getByLabel("Phone number").fill(phone.typed);
  await form.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await form.getByLabel("Confirm password").fill(PASSWORD);
  await form.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/en\/account$/);
  // Hiện SĐT, không hiện email nội bộ.
  await expect(hello(page)).toContainText(`Hello, Ma Phone · ${phone.normalized}`);
  await expect(hello(page)).not.toContainText("phone.glow.invalid");

  // Đăng ký lại cùng SĐT → báo đã có tài khoản.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/en$/);
  await page.goto("/en/register");
  const again = page.locator("form").filter({ has: page.getByLabel("Phone number") });
  await again.getByLabel("Full name").fill("Ma Copy");
  await again.getByLabel("Phone number").fill(phone.normalized);
  await again.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await again.getByLabel("Confirm password").fill(PASSWORD);
  await again.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "already has an account" })).toBeVisible();

  // Sai mật khẩu → lỗi; đúng (gõ dạng +95) → vào tài khoản.
  await phoneLogin(page, phone.normalized, "sai-mat-khau-1");
  await expect(page.getByRole("alert").filter({ hasText: "Wrong phone number or password." })).toBeVisible();
  await phoneLogin(page, phone.typed, PASSWORD);
  await expect(page).toHaveURL(/\/en\/account$/);

  // Checkout: SĐT tài khoản được điền sẵn.
  await page.goto("/en/p/sen-viet-sunscreen-spf50");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await page.getByRole("link", { name: "Checkout" }).click();
  await expect(page.getByLabel("Phone number")).toHaveValue(phone.normalized);
  await expect(page.getByTestId("ordering-as")).toContainText(phone.normalized);
});

test("khách SĐT quên mật khẩu → admin đặt mật khẩu tạm → khách đăng nhập bằng mật khẩu tạm", async ({ page }) => {
  test.setTimeout(90_000);
  const phone = randomPhone();
  await page.goto("/en/register");
  const form = page.locator("form").filter({ has: page.getByLabel("Phone number") });
  await form.getByLabel("Full name").fill("Ma Quen");
  await form.getByLabel("Phone number").fill(phone.normalized);
  await form.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await form.getByLabel("Confirm password").fill(PASSWORD);
  await form.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/en\/account$/);

  await login(page, "admin@glow.local");
  await page.goto(`/admin/customer-accounts?q=${phone.normalized}`);
  const row = page.getByTestId("customer-row").filter({ hasText: phone.normalized });
  await expect(row).toContainText("SĐT + mật khẩu");
  // Mật khẩu tạm nằm ở trang sửa khách (bút chì ở dòng).
  await row.getByRole("link", { name: "Sửa", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/customer-accounts\/[^/?]+$/);
  const main = page.getByRole("main");
  await main.getByLabel(/Mật khẩu tạm/).fill("tam-thoi-456");
  await main.getByRole("button", { name: "Đặt lại mật khẩu" }).click();
  await expect(main.getByRole("status").filter({ hasText: "Đã đặt mật khẩu tạm" })).toBeVisible();

  await page.context().clearCookies();
  await phoneLogin(page, phone.normalized, PASSWORD);
  await expect(page.getByRole("alert").filter({ hasText: "Wrong phone number or password." })).toBeVisible();
  await phoneLogin(page, phone.normalized, "tam-thoi-456");
  await expect(page).toHaveURL(/\/en\/account$/);
});
