import { expect, test, type Page } from "@playwright/test";
import Rabbit from "rabbit-node";
import { CUSTOMER_PASSWORD, emailLink, login, loginCustomer, PASSWORD, pickAddress, pickAddressAdmin, registerCustomer } from "./helpers";

/** Lời chào đang hiển thị (Next giữ trang trước ở trạng thái ẩn → có thể có bản thứ hai không hiển thị). */
const hello = (page: Page) => page.getByTestId("account-hello").filter({ visible: true });

// P14b: tài khoản khách — đăng ký + xác minh email, quên mật khẩu, khu tài khoản, sổ địa chỉ, nhận đơn cũ, tách cổng.

test("đăng ký → xác minh email → vào tài khoản; đăng xuất; đăng nhập lại", async ({ page }) => {
  const email = await registerCustomer(page);
  await expect(page).toHaveURL(/\/en\/account$/);
  await expect(hello(page)).toContainText(`Hello, Ma E2E · ${email}`);
  await expect(page.getByText("You have no orders yet.")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/en$/);
  await page.goto("/en/account");
  await expect(page).toHaveURL(/\/en\/login\?next=%2Fen%2Faccount$/);

  await loginCustomer(page, email, "wrong-password-1");
  await expect(page.getByRole("alert").filter({ hasText: "Wrong email or password." })).toBeVisible();
  await loginCustomer(page, email);
  await expect(page).toHaveURL(/\/en\/account$/);
});

test("quên mật khẩu → link email → đặt mật khẩu mới → đăng nhập bằng mật khẩu mới", async ({ page }) => {
  const email = await registerCustomer(page);
  await page.context().clearCookies();
  const since = Date.now();
  await page.goto("/en/forgot-password");
  await page.getByText("Reset by email instead").click(); // cách chính là SĐT + chờ admin xác nhận; email nằm trong khối thu gọn
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send link" }).click();
  await expect(page.getByText(`If an account exists for ${email}`)).toBeVisible();

  await page.goto(await emailLink(email, since));
  await expect(page).toHaveURL(/\/en\/reset-password\?token=/);
  await page.getByLabel("New password").fill("e2e-new-pass-22");
  await page.getByLabel("Confirm password").fill("e2e-new-pass-22");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByText("Password updated.")).toBeVisible();

  await loginCustomer(page, email, CUSTOMER_PASSWORD);
  await expect(page.getByRole("alert").filter({ hasText: "Wrong email or password." })).toBeVisible();
  await loginCustomer(page, email, "e2e-new-pass-22");
  await expect(page).toHaveURL(/\/en\/account$/);
});

test("sổ địa chỉ: thêm (Zawgyi → Unicode), sửa, đặt mặc định, xoá", async ({ page }) => {
  await registerCustomer(page);
  await page.getByRole("link", { name: "Addresses" }).click();
  await expect(page.getByText("No saved addresses yet.")).toBeVisible();

  const add = async (name: string, phone: string) => {
    const form = page.getByTestId("address-form");
    await form.getByLabel("Recipient name").fill(name);
    await form.getByLabel("Phone number").fill(phone);
    await pickAddress(form);
    await form.getByLabel("Address (house no., street, ward)").fill("No. 9, Inya Road");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  };
  await add("Ma Aye", "+95 9 7812 1111");
  // Địa chỉ đầu tiên tự thành mặc định; SĐT chuẩn hoá về 09…
  const first = page.getByTestId("address").filter({ hasText: "Ma Aye" });
  await expect(first).toContainText("0978121111");
  await expect(first).toContainText("Default");

  // Tên gõ bằng Zawgyi được lưu thành Unicode.
  await add(Rabbit.uni2zg("ကျောင်း"), "09 7812 2222");
  const second = page.getByTestId("address").filter({ hasText: "0978122222" });
  await expect(second).toContainText("ကျောင်း");
  await expect(second).not.toContainText("Default");

  await second.getByRole("button", { name: "Set as default" }).click();
  await expect(second).toContainText("Default");
  await expect(first).not.toContainText("Default");

  await first.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Edit address" })).toBeVisible();
  await page.getByTestId("address-form").getByLabel("Recipient name").fill("Ma Aye Aye");
  await page.getByTestId("address-form").getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("address").filter({ hasText: "Ma Aye Aye" })).toHaveCount(1);

  // Xoá địa chỉ hỏi xác nhận (hộp thoại gốc) — bấm OK.
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("address").filter({ hasText: "Ma Aye Aye" }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("address")).toHaveCount(1);
});

test("hồ sơ: đổi tên + đổi mật khẩu", async ({ page }) => {
  const email = await registerCustomer(page);
  await page.getByRole("link", { name: "Profile" }).click();
  await page.getByLabel("Full name").fill("Ma Profile");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  await expect(hello(page)).toContainText("Hello, Ma Profile");

  await page.getByLabel("Current password").fill("wrong-password-1");
  await page.getByLabel("New password", { exact: true }).fill("e2e-changed-pass-3");
  await page.getByLabel("Confirm new password").fill("e2e-changed-pass-3");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Current password is incorrect." })).toBeVisible();
  await page.getByLabel("Current password").fill(CUSTOMER_PASSWORD);
  await page.getByLabel("New password", { exact: true }).fill("e2e-changed-pass-3");
  await page.getByLabel("Confirm new password").fill("e2e-changed-pass-3");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Password changed." })).toBeVisible();

  await page.context().clearCookies();
  await loginCustomer(page, email, "e2e-changed-pass-3");
  await expect(page).toHaveURL(/\/en\/account$/);
});

const VARIANT = "SV-SUN-50 — Sunscreen SPF50 PA++++ (50ml)";

/** Huỷ đơn trong admin (nhả hàng giữ chỗ để lần chạy sau vẫn còn tồn). */
async function cancelOrder(page: Page, code: string) {
  await login(page, "donhang@glow.local");
  await page.goto(`/admin/orders?q=${code}`);
  await page.getByRole("link", { name: code }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Huỷ đơn" }).click();
  await expect(page.getByTestId("order-status")).toContainText("Đã huỷ");
}

test("đơn ngoài web (nhân viên tạo) → khách tra mã + SĐT → đăng ký → đơn vào tài khoản", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "donhang@glow.local");
  await page.goto("/admin/orders/new?phone=09%207812%207777");
  await page.getByLabel("Tên người nhận").fill("Ma Claim");
  await pickAddressAdmin(page);
  await page.getByLabel("Địa chỉ").fill("No. 1, Claim Road");
  const option = page.getByLabel("Biến thể").locator("option", { hasText: VARIANT });
  await page.getByLabel("Biến thể").selectOption((await option.getAttribute("value"))!);
  await page.getByLabel("SL", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Tạo đơn" }).click();
  await expect(page).toHaveURL(/\/admin\/orders\/[^/]+$/);
  // Next giữ trang "Tạo đơn" ở trạng thái ẩn → lấy đúng tiêu đề chứa mã đơn.
  const heading = page.getByRole("heading", { level: 1 }).filter({ hasText: /OD-/ });
  const code = (await heading.textContent())!.match(/OD-[\w-]+/)![0];

  // Khách (chưa có tài khoản) tra đơn bằng mã + SĐT → trình duyệt nhớ đơn → đăng ký thì đơn gắn vào tài khoản.
  await page.context().clearCookies();
  await page.goto(`/en/track?code=${code}`);
  await page.getByLabel("Phone number used for the order").fill("09 7812 7777");
  await page.getByRole("button", { name: "Find order" }).click();
  await expect(page.getByTestId("order-code")).toHaveText(code);

  await registerCustomer(page);
  const row = page.getByTestId("account-order").filter({ hasText: code });
  await expect(row).toContainText("Waiting for confirmation");
  // Mở được đơn từ tài khoản dù đã xoá cookie nhớ đơn.
  await page.context().clearCookies({ name: "my_orders" });
  await row.click();
  await expect(page.getByTestId("order-code")).toHaveText(code);

  await cancelOrder(page, code);
});

test("đặt hàng khi đã đăng nhập: địa chỉ mới được lưu vào sổ, lần sau tự điền; đơn hiện trong tài khoản", async ({ page }) => {
  test.setTimeout(120_000);
  const email = await registerCustomer(page);
  await page.goto("/en/p/sen-viet-sunscreen-spf50");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await page.getByRole("link", { name: "Checkout" }).click();
  await expect(page).toHaveURL(/\/en\/checkout$/);
  await expect(page.getByTestId("ordering-as")).toContainText(email);
  await expect(page.getByLabel("Full name")).toHaveValue("Ma E2E");
  await page.getByLabel("Phone number").fill("09 7812 5151");
  await page.getByLabel("Alternative phone (optional)").fill("09 7812 5252");
  await pickAddress(page);
  await expect(page.getByTestId("shipping-note")).toContainText("paid to the courier on delivery");
  await page.getByLabel("Address (house no., street, ward)").fill("No. 51, Saved Road");
  await expect(page.getByLabel("Save to my address book")).toBeChecked();
  await page.getByText("Cash on delivery", { exact: true }).click();
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page).toHaveURL(/\/en\/order\/OD-/);
  const code = (await page.getByTestId("order-code").textContent())!.trim();

  await page.goto("/en/account");
  await expect(page.getByTestId("account-order").filter({ hasText: code })).toBeVisible();
  await page.goto("/en/account/addresses");
  await expect(page.getByTestId("address").filter({ hasText: "0978125151" })).toContainText("No. 51, Saved Road");

  // Lần sau: chọn sẵn địa chỉ mặc định, các ô được điền.
  await page.goto("/en/p/sen-viet-sunscreen-spf50");
  await page.getByRole("button", { name: "Buy now" }).click();
  await expect(page).toHaveURL(/\/en\/checkout$/);
  await expect(page.getByLabel("Deliver to")).toContainText("0978125151");
  await expect(page.getByLabel("Phone number")).toHaveValue("0978125151");
  await expect(page.getByLabel("Address (house no., street, ward)")).toHaveValue("No. 51, Saved Road");
  await expect(page.getByLabel("Township")).not.toHaveValue("");
  await page.getByLabel("Deliver to").selectOption({ label: "A new address" });
  await expect(page.getByLabel("Phone number")).toHaveValue("");

  // Admin: địa chỉ VTP đủ 3 cấp + SĐT phụ; tổng tiền không có phí ship.
  await cancelOrder(page, code);
  await expect(page.getByText("Kamaryut, Yangon (West), Yangon (ကမာရွတ်)")).toBeVisible();
  await expect(page.getByTestId("order-phone2")).toContainText("0978125252");
  await expect(page.getByText("Phí ship do đơn vị vận chuyển thu khi giao")).toBeVisible();
});

test("tách cổng: nhân viên không đăng nhập ở cổng khách; khách không vào được admin", async ({ page }) => {
  await loginCustomer(page, "admin@glow.local", PASSWORD);
  await expect(page.getByRole("alert").filter({ hasText: "staff account" })).toBeVisible();

  await loginCustomer(page, "khach@glow.local", PASSWORD);
  await expect(page).toHaveURL(/\/en\/account$/);
  await expect(hello(page)).toContainText("khach@glow.local");
  // Phiên khách không mở được admin (cookie khác) → trang đăng nhập admin; đăng nhập bằng tài khoản khách bị từ chối.
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.getByLabel("Email").fill("khach@glow.local");
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /cổng|cộng tác viên/i })).toBeVisible();
});
