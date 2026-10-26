import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { login, openAdminNav } from "./helpers";

test("admin tạo nhân viên → nhân viên đăng nhập đúng quyền → admin khoá → bị đăng xuất, không đăng nhập lại được", async ({
  page,
  browser,
}) => {
  const email = `e2e-staff-${randomBytes(4).toString("hex")}@glow.local`;
  const password = `E2E-tam-${randomBytes(6).toString("hex")}`;

  await login(page, "admin@glow.local");
  await (await openAdminNav(page)).getByRole("link", { name: "Nhân viên" }).click();
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
    await expect(nav.getByRole("link", { name: "Đơn hàng" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Nhân viên" })).toHaveCount(0);
    await staff.goto("/admin/users");
    await expect(staff).toHaveURL(/\/admin\?denied=1$/);

    // Admin khoá tài khoản.
    await row.getByRole("link", { name: "Sửa" }).click();
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

test("trang của chính mình: không có nút khoá / đặt lại mật khẩu, vai trò không đổi được", async ({ page }) => {
  await login(page, "admin@glow.local");
  await page.goto("/admin/users/seed-admin");
  await expect(page.getByText("Đây là tài khoản của bạn")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Vai trò" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Khoá tài khoản" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Đặt mật khẩu tạm" })).toHaveCount(0);
});
