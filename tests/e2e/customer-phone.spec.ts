import { expect, test, type Page } from "@playwright/test";
import { login, openAdminGroup } from "./helpers";

// P17: khách đăng ký / đăng nhập bằng SĐT + mật khẩu (không OTP); quên mật khẩu → khách gửi yêu cầu, admin xác nhận trên web.

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
  await page.getByRole("button", { name: "Checkout" }).click();
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

test("quên mật khẩu (D3 21/11/2026): khách đặt mật khẩu mới → dùng được ngay; admin thấy trong danh sách và đánh dấu Đã kiểm tra", async ({ page }) => {
  test.setTimeout(120_000);
  const phone = randomPhone();
  const NEW = "e2e-new-pass-9";
  await page.goto("/en/register");
  const reg = page.locator("form").filter({ has: page.getByLabel("Phone number") });
  await reg.getByLabel("Full name").fill("Ma Quen Mat Khau");
  await reg.getByLabel("Phone number").fill(phone.normalized);
  await reg.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await reg.getByLabel("Confirm password").fill(PASSWORD);
  await reg.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/en\/account$/);
  await page.context().clearCookies();

  // Trang đăng nhập: không còn nút Google, có link Quên mật khẩu.
  await page.goto("/en/login");
  await expect(page.getByRole("button", { name: /Google/ })).toHaveCount(0);
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/en\/forgot-password$/);

  // Mật khẩu không khớp → báo lỗi, giữ nguyên ô đã nhập.
  const form = page.locator("form").filter({ has: page.getByLabel("New password", { exact: true }) });
  await form.getByLabel("Phone number").fill(phone.typed);
  await form.getByLabel("New password", { exact: true }).fill(NEW);
  await form.getByLabel("Confirm password").fill("khac-hoan-toan-1");
  await form.getByRole("button", { name: "Reset password" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Passwords do not match." })).toBeVisible();
  await expect(form.getByLabel("Phone number")).toHaveValue(phone.typed);

  await form.getByLabel("Confirm password").fill(NEW);
  await form.getByRole("button", { name: "Reset password" }).click();
  await expect(page.getByText("Your password has been updated successfully.")).toBeVisible();

  // Có hiệu lực ngay: mật khẩu cũ hết dùng, mật khẩu mới vào được.
  await phoneLogin(page, phone.normalized, PASSWORD);
  await expect(page.getByRole("alert").filter({ hasText: "Wrong phone number or password." })).toBeVisible();
  await phoneLogin(page, phone.normalized, NEW);
  await expect(page).toHaveURL(/\/en\/account$/);

  // Admin: thấy số trên menu + khối "khách vừa đổi mật khẩu", bấm Đã kiểm tra → khối biến mất.
  await login(page, "admin@glow.local");
  const nav = await openAdminGroup(page, "Cài đặt");
  await expect(nav.getByRole("link", { name: /^Tài khoản/ })).toContainText(/\d/);
  await page.keyboard.press("Escape"); // đóng ngăn kéo menu (mobile)
  await page.goto(`/admin/customer-accounts?q=${phone.normalized}`);
  const request = page.getByTestId("reset-request").filter({ hasText: phone.normalized });
  await expect(request).toContainText("Ma Quen Mat Khau");
  page.once("dialog", (d) => d.accept());
  await request.getByRole("button", { name: "Đã kiểm tra", exact: true }).click();
  await expect(page.getByTestId("reset-request").filter({ hasText: phone.normalized })).toHaveCount(0);
});

test("quên mật khẩu (D3): SĐT chưa đăng ký thấy cùng câu trả lời (không lộ); admin khoá tài khoản nghi ngờ → không đăng nhập được", async ({ page }) => {
  test.setTimeout(120_000);
  const phone = randomPhone();
  const NEW = "e2e-other-pass-3";
  await page.goto("/en/register");
  const reg = page.locator("form").filter({ has: page.getByLabel("Phone number") });
  await reg.getByLabel("Full name").fill("Ma Bi Khoa");
  await reg.getByLabel("Phone number").fill(phone.normalized);
  await reg.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await reg.getByLabel("Confirm password").fill(PASSWORD);
  await reg.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/en\/account$/);
  await page.context().clearCookies();

  const ask = async (value: string) => {
    await page.goto("/en/forgot-password");
    const form = page.locator("form").filter({ has: page.getByLabel("New password", { exact: true }) });
    await form.getByLabel("Phone number").fill(value);
    await form.getByLabel("New password", { exact: true }).fill(NEW);
    await form.getByLabel("Confirm password").fill(NEW);
    await form.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByText("Your password has been updated successfully.")).toBeVisible();
  };
  await ask(phone.normalized);
  await ask(`09${String(100_000_000 + Math.floor(Math.random() * 900_000_000))}`); // chưa đăng ký: cùng câu trả lời

  await login(page, "admin@glow.local");
  await page.goto(`/admin/customer-accounts?q=${phone.normalized}`);
  const request = page.getByTestId("reset-request").filter({ hasText: phone.normalized });
  page.once("dialog", (d) => d.accept());
  await request.getByRole("button", { name: "Khoá tài khoản", exact: true }).click();
  await expect(request.getByRole("button", { name: "Khoá tài khoản", exact: true })).toHaveCount(0);

  await page.context().clearCookies();
  await phoneLogin(page, phone.normalized, NEW);
  await expect(page.getByRole("alert").filter({ hasText: "This account is locked." })).toBeVisible();
});
