import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { login, openAdminGroup, openAdminNav } from "./helpers";

test("admin tạo nhân viên → nhân viên đăng nhập đúng quyền → admin khoá → bị đăng xuất, không đăng nhập lại được", async ({
  page,
  browser,
}) => {
  test.setTimeout(60_000); // Hai trình duyệt, tạo/khóa tài khoản rồi kiểm thu hồi phiên và đóng context.
  const email = `e2e-staff-${randomBytes(4).toString("hex")}@glow.local`;
  const password = `E2E-tam-${randomBytes(6).toString("hex")}`;

  await login(page, "admin@glow.local");
  await (await openAdminGroup(page, "Cài đặt")).getByRole("link", { name: /^Tài khoản/ }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await page.getByRole("link", { name: "Thêm nhân viên" }).click();
  // React reset form sau mỗi lần gửi → điền lại toàn bộ.
  // getByRole bỏ qua các trang trước Next còn giữ ẩn trong DOM (ô tìm "…email", form đăng nhập).
  const fillForm = async (pw: string) => {
    await page.getByRole("textbox", { name: "Họ tên" }).fill("Ma E2E");
    await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
    await page.getByRole("combobox", { name: "Vai trò" }).selectOption("ORDER_STAFF");
    await page.getByLabel("Mật khẩu tạm").fill(pw);
    await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  };
  // Mật khẩu ngắn → báo lỗi (bỏ minLength của trình duyệt để lỗi đến từ server).
  await page.getByLabel("Mật khẩu tạm").evaluate((el) => el.removeAttribute("minlength"));
  await fillForm("ngan");
  await expect(page.getByRole("alert").filter({ hasText: "ít nhất 12 ký tự" })).toBeVisible();
  await fillForm(password);
  await expect(page).toHaveURL(/\/admin\/users\?saved=1$/);
  await expect(page.getByText("Đã tạo tài khoản nhân viên")).toBeVisible();

  await page.goto(`/admin/users?q=${encodeURIComponent(email)}`);
  const row = page.getByTestId("user-row");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Nhân viên đơn hàng");
  await expect(row).toContainText("Đang hoạt động");

  // Nhân viên mới (trình duyệt riêng): thấy menu Đơn hàng, không vào được trang Nhân viên.
  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  try {
    await login(staff, email, password);
    const nav = await openAdminNav(staff);
    await expect(nav.getByText("Đơn hàng", { exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Nhân viên" })).toHaveCount(0);
    await staff.goto("/admin/users");
    await expect(staff).toHaveURL(/\/admin\?denied=1$/);

    // Admin khoá tài khoản.
    await row.getByRole("link", { name: "Sửa" }).click();
    // Chờ sang trang sửa: dòng danh sách cũng có icon "Khoá tài khoản" — bấm trúng nó lúc đang chuyển trang thì treo.
    await expect(page).toHaveURL(/\/admin\/users\/[^/?]+$/);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Khoá tài khoản" }).click();
    await expect(page.getByRole("button", { name: "Mở khoá tài khoản" })).toBeVisible();

    // Phiên của nhân viên bị xoá → về trang đăng nhập; đăng nhập lại bị từ chối.
    await staff.goto("/admin");
    await expect(staff).toHaveURL(/\/admin\/login$/);
    await staff.getByLabel("Email").fill(email);
    await staff.getByLabel("Mật khẩu", { exact: true }).fill(password);
    await staff.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(staff.getByRole("alert").filter({ hasText: "Tài khoản đã bị khoá. Liên hệ quản trị viên." })).toBeVisible();
  } finally {
    await staffContext.close();
  }
});

test("Cài đặt → Nhân viên → admin đổi email nhân viên → nhân viên đăng nhập bằng email mới", async ({ page, browser }) => {
  const tag = randomBytes(4).toString("hex");
  const oldEmail = `e2e-mail-${tag}@glow.local`;
  const newEmail = `e2e-mail-${tag}@tandcstore.com`;
  const password = `E2E-tam-${randomBytes(6).toString("hex")}`;

  await login(page, "admin@glow.local");
  await page.goto("/admin/settings");
  await page.getByTestId("settings-accounts").getByRole("link", { name: /^Nhân viên/ }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await page.getByRole("link", { name: "Thêm nhân viên" }).click();
  await page.getByRole("textbox", { name: "Họ tên" }).fill("Ko Mail");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(oldEmail);
  await page.getByRole("combobox", { name: "Vai trò" }).selectOption("WAREHOUSE_MANAGER");
  await page.getByLabel("Mật khẩu tạm").fill(password);
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  await expect(page).toHaveURL(/\/admin\/users\?saved=1$/);

  await page.goto(`/admin/users?q=${encodeURIComponent(oldEmail)}`);
  await page.getByTestId("user-row").getByRole("link", { name: "Sửa" }).click();
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(newEmail);
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Đã lưu")).toBeVisible();
  await expect(page.getByText(newEmail).first()).toBeVisible();

  const staffContext = await browser.newContext();
  try {
    await login(await staffContext.newPage(), newEmail, password);
  } finally {
    await staffContext.close();
  }
});

test("trang của chính mình: không có nút khoá / đặt lại mật khẩu, vai trò không đổi được", async ({ page }) => {
  await login(page, "admin@glow.local");
  await page.goto("/admin/users/seed-admin");
  await expect(page.getByText("Đây là tài khoản của bạn")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Vai trò" })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Email", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Khoá tài khoản" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Đặt mật khẩu tạm" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Xoá tài khoản" })).toHaveCount(0);
  // Dòng của mình ở danh sách chỉ có Sửa.
  await page.goto("/admin/users?q=admin%40glow.local");
  const me = page.getByTestId("user-row").filter({ hasText: "admin@glow.local" });
  await expect(me.getByRole("link", { name: "Sửa", exact: true })).toBeVisible();
  await expect(me.getByRole("button")).toHaveCount(0);
});

test("danh sách nhân viên: icon Khoá/Mở khoá và Xoá tài khoản tạo nhầm", async ({ page }) => {
  const email = `e2e-del-${randomBytes(4).toString("hex")}@glow.local`;
  await login(page, "admin@glow.local");
  await page.goto("/admin/users/new");
  await page.getByRole("textbox", { name: "Họ tên" }).fill("Tạo nhầm E2E");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.getByRole("combobox", { name: "Vai trò" }).selectOption("ORDER_STAFF");
  await page.getByLabel("Mật khẩu tạm").fill(`E2E-tam-${randomBytes(6).toString("hex")}`);
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  await expect(page).toHaveURL(/\/admin\/users\?saved=1$/);

  await page.goto(`/admin/users?q=${encodeURIComponent(email)}`);
  const row = page.getByTestId("user-row");
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Khoá tài khoản", exact: true }).click();
  await expect(row).toContainText("Đã khoá");
  await row.getByRole("button", { name: "Mở khoá tài khoản", exact: true }).click();
  await expect(row).toContainText("Đang hoạt động");

  page.once("dialog", (d) => d.dismiss());
  await row.getByRole("button", { name: "Xoá tài khoản", exact: true }).click();
  await expect(row).toHaveCount(1);
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Xoá tài khoản", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await page.goto(`/admin/users?q=${encodeURIComponent(email)}`);
  await expect(page.getByTestId("user-row")).toHaveCount(0);
});
