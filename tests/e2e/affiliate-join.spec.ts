import { expect, test } from "@playwright/test";
import { login, loginCtv } from "./helpers";

// P11b: người mới mở link mời của CTV MAUNG → đăng ký → admin duyệt → CTV mới đăng nhập được, nằm dưới MAUNG.

test("đăng ký qua link mời → admin duyệt → CTV mới đăng nhập cổng CTV", async ({ page }) => {
  test.setTimeout(90_000);
  const stamp = Date.now().toString(36).toUpperCase().slice(-6);
  const email = `join-${stamp.toLowerCase()}@ctv.glow.local`;
  const password = "join-mat-khau-12";
  const base = test.info().project.use.baseURL ?? process.env.APP_URL;

  await page.context().clearCookies();
  await page.context().addCookies([{ name: "CTV_LOCALE", value: "vi", url: `${base}/ctv` }]);

  // Link sai → báo không hợp lệ, không có form.
  await page.goto("/ctv/join?inv=ZZZZ9999");
  await expect(page.getByTestId("join-invalid")).toBeVisible();

  await page.goto("/ctv/join?inv=maung");
  await expect(page.getByText("Được mời bởi Ko Maung (CTV) (MAUNG)", { exact: false })).toBeVisible();
  await page.getByLabel("Họ tên").fill(`Ko Join ${stamp}`);
  await page.getByLabel("Số điện thoại").fill(`09 7${String(Date.now()).slice(-7)}`);
  await page.getByLabel("Email (dùng để đăng nhập)").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByLabel("Nhập lại mật khẩu").fill(password);
  await page.getByRole("button", { name: "Gửi đăng ký" }).click();
  await expect(page.getByTestId("join-sent")).toBeVisible();

  // Chưa duyệt → chưa đăng nhập được.
  await page.goto("/ctv/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Sai email hoặc mật khẩu" })).toBeVisible();

  // Admin duyệt.
  await login(page, "admin@glow.local");
  await page.goto("/admin/affiliates/applications");
  const card = page.getByTestId("application").filter({ hasText: email });
  await expect(card).toContainText("MAUNG");
  await card.getByLabel("Mã giới thiệu").fill(`J${stamp}`);
  await card.getByRole("button", { name: "Duyệt" }).click();
  await expect(page).toHaveURL(/\/admin\/affiliates\/[^/?]+\?approved=1$/);
  await expect(page.getByTestId("affiliate-parent")).toContainText("MAUNG");

  // CTV mới đăng nhập bằng mật khẩu đã đặt khi đăng ký.
  await loginCtv(page, email, password);
  await expect(page.getByTestId("ctv-user")).toContainText(`J${stamp}`);
});
