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

test("quên mật khẩu: khách nhập mật khẩu mới → yêu cầu chờ → admin xác nhận trên web → khách dùng mật khẩu mới", async ({ page }) => {
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
  await form.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Passwords do not match." })).toBeVisible();
  await expect(form.getByLabel("Phone number")).toHaveValue(phone.typed);

  await form.getByLabel("Confirm password").fill(NEW);
  await form.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText("Request sent. After the shop confirms it, sign in with your new password.")).toBeVisible();

  // Chưa xác nhận: mật khẩu mới chưa dùng được, mật khẩu cũ vẫn dùng được.
  await phoneLogin(page, phone.normalized, NEW);
  await expect(page.getByRole("alert").filter({ hasText: "Wrong phone number or password." })).toBeVisible();

  // Admin: thấy số trên menu + khối yêu cầu, bấm Xác nhận.
  await login(page, "admin@glow.local");
  const nav = await openAdminGroup(page, "Cài đặt");
  await expect(nav.getByRole("link", { name: /^Tài khoản/ })).toContainText(/\d/);
  await page.keyboard.press("Escape"); // đóng ngăn kéo menu (mobile)
  await page.goto(`/admin/customer-accounts?q=${phone.normalized}`);
  const request = page.getByTestId("reset-request").filter({ hasText: phone.normalized });
  await expect(request).toContainText("Ma Quen Mat Khau");
  page.once("dialog", (d) => d.accept());
  await request.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page.getByTestId("reset-request").filter({ hasText: phone.normalized })).toHaveCount(0);

  // Khách đăng nhập bằng mật khẩu mới; mật khẩu cũ hết dùng.
  await page.context().clearCookies();
  await phoneLogin(page, phone.normalized, PASSWORD);
  await expect(page.getByRole("alert").filter({ hasText: "Wrong phone number or password." })).toBeVisible();
  await phoneLogin(page, phone.normalized, NEW);
  await expect(page).toHaveURL(/\/en\/account$/);
});

test("quên mật khẩu: admin từ chối → mật khẩu cũ giữ nguyên; SĐT chưa đăng ký vẫn thấy câu 'đã gửi' (không lộ)", async ({ page }) => {
  test.setTimeout(120_000);
  const phone = randomPhone();
  await page.goto("/en/register");
  const reg = page.locator("form").filter({ has: page.getByLabel("Phone number") });
  await reg.getByLabel("Full name").fill("Ma Tu Choi");
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
    await form.getByLabel("New password", { exact: true }).fill("e2e-other-pass-3");
    await form.getByLabel("Confirm password").fill("e2e-other-pass-3");
    await form.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByText("Request sent. After the shop confirms it, sign in with your new password.")).toBeVisible();
  };
  await ask(phone.normalized);
  await ask(`09${String(100_000_000 + Math.floor(Math.random() * 900_000_000))}`); // chưa đăng ký: cùng câu trả lời

  await login(page, "admin@glow.local");
  await page.goto(`/admin/customer-accounts?q=${phone.normalized}`);
  const request = page.getByTestId("reset-request").filter({ hasText: phone.normalized });
  page.once("dialog", (d) => d.accept());
  await request.getByRole("button", { name: "Từ chối", exact: true }).click();
  await expect(page.getByTestId("reset-request").filter({ hasText: phone.normalized })).toHaveCount(0);

  await page.context().clearCookies();
  await phoneLogin(page, phone.normalized, PASSWORD);
  await expect(page).toHaveURL(/\/en\/account$/);
});
