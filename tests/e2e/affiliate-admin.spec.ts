import { expect, test, type Page } from "@playwright/test";
import { login, pickAddressAdmin } from "./helpers";

// P10b: admin tạo CTV → gán CTV khi tạo đơn → đơn hoàn tất → (hạn giữ = 0) ghi nhận chi trả.

const VARIANT = "SV-SUN-50 — Sunscreen SPF50 PA++++ (50ml)";
const HOLD_LABEL = "Hoa hồng đến hạn sau khi đơn hoàn thành (ngày)";

async function setHoldDays(page: Page, days: number) {
  await page.goto("/admin/settings");
  await page.getByLabel(HOLD_LABEL).fill(String(days));
  await page.getByRole("button", { name: "Lưu cài đặt" }).click();
  await expect(page.getByRole("status")).toHaveText("Đã lưu");
}

test("admin: tạo CTV, gán vào đơn, đơn hoàn tất rồi ghi nhận chi trả hoa hồng", async ({ page }) => {
  test.setTimeout(120_000);
  const code = `E2E${Date.now().toString(36).toUpperCase().slice(-6)}`;
  await login(page, "admin@glow.local");

  // Tạo CTV.
  await page.goto("/admin/affiliates/new");
  await page.getByLabel("Tên").fill(`CTV ${code}`);
  await page.getByLabel("Email đăng nhập").fill(`${code.toLowerCase()}@ctv.glow.local`);
  await page.getByLabel("Số điện thoại").fill("09 7812 0000");
  await page.getByLabel("Mã giới thiệu").fill(code);
  await page.getByLabel("Hoa hồng (%)").fill("10");
  await page.getByLabel("Mật khẩu tạm").fill("ctv-mat-khau-12");
  await page.getByRole("button", { name: "Tạo CTV" }).click();
  await expect(page).toHaveURL(/\/admin\/affiliates\/[^/?]+\?created=1$/);
  await expect(page.getByTestId("ref-link")).toHaveText(new RegExp(`/\\?ref=${code}$`));
  const affiliateUrl = page.url().split("?")[0];

  // Tạo đơn tay, chọn CTV.
  await page.goto("/admin/orders/new?phone=09%207812%200000");
  await page.getByLabel("Tên người nhận").fill("Ma Aye");
  await pickAddressAdmin(page);
  await page.getByLabel("Địa chỉ").fill("No. 5, Pansodan St");
  const option = page.getByLabel("Biến thể").locator("option", { hasText: VARIANT });
  await page.getByLabel("Biến thể").selectOption((await option.getAttribute("value"))!);
  await page.getByLabel("SL", { exact: true }).fill("1");
  await page.getByLabel("CTV (không bắt buộc)").selectOption({ label: `${code} — CTV ${code}` });
  await page.getByRole("button", { name: "Tạo đơn" }).click();
  await expect(page).toHaveURL(/\/admin\/orders\/[^/]+$/);
  const section = page.getByTestId("order-affiliate");
  await expect(section).toContainText(code);
  await expect(section).toContainText("Nhân viên gán");
  await expect(section).toContainText("Chờ");

  // Admin đi hết luồng đơn.
  await page.getByRole("button", { name: "Xác nhận đơn" }).click();
  await expect(page.getByTestId("order-status")).toContainText("Chuẩn bị giao");
  const from = page.getByLabel("Kho xuất");
  if (await from.count()) await from.selectOption({ label: "MM-STOCK — Kho Yangon" });
  await page.getByLabel("Đơn vị vận chuyển").fill("Royal Express");
  await page.getByRole("button", { name: "Đã bàn giao vận chuyển" }).click();
  await expect(page.getByTestId("order-status")).toContainText("Đang giao");
  await page.getByRole("button", { name: "Giao thành công · Đã thu tiền" }).click();
  await expect(page.getByTestId("order-status")).toContainText("Hoàn tất");

  // Hạn giữ 0 ngày → hoa hồng đến hạn ngay; ghi nhận chi trả.
  await setHoldDays(page, 0);
  try {
    await page.goto(affiliateUrl);
    await expect(page.getByTestId("due-summary")).toContainText("1 đơn");
    await page.getByLabel("Ghi chú (mã giao dịch, kênh chuyển…)").fill("KBZPay E2E");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Ghi nhận đã trả" }).click();
    // Trả xong không còn gì đến hạn → khối chi trả (kèm thông báo) biến mất, lịch sử có 1 dòng.
    await expect(page.getByTestId("payout-row")).toHaveCount(1);
    await expect(page.getByTestId("payout-row")).toContainText("KBZPay E2E");
    await expect(page.getByText("Chưa có hoa hồng đến hạn.")).toBeVisible();
  } finally {
    await setHoldDays(page, 7);
  }

  // Danh sách CTV tìm được theo mã.
  await page.goto(`/admin/affiliates?q=${code}`);
  await expect(page.getByTestId("affiliate-row")).toHaveCount(1);
  const row = page.getByTestId("affiliate-row");
  await expect(row.getByRole("link", { name: "Sửa", exact: true })).toHaveAttribute("href", /#profile$/);
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Xoá CTV", exact: true }).click();
  await expect(row.getByRole("alert")).toContainText("Hãy khoá tài khoản");
});

test("admin: sửa CTV từ danh sách, hủy xác nhận rồi xóa tài khoản chưa có dữ liệu", async ({ page }) => {
  const code = `DEL${Date.now().toString(36).toUpperCase().slice(-6)}`;
  await login(page, "admin@glow.local");
  await page.goto("/admin/affiliates/new");
  await page.getByLabel("Tên", { exact: true }).fill(`CTV ${code}`);
  await page.getByLabel("Email đăng nhập").fill(`${code.toLowerCase()}@ctv.glow.local`);
  await page.getByLabel("Số điện thoại").fill("09 7812 0000");
  await page.getByLabel("Mã giới thiệu").fill(code);
  await page.getByLabel("Hoa hồng (%)").fill("10");
  await page.getByLabel("Mật khẩu tạm").fill("ctv-mat-khau-12");
  await page.getByRole("button", { name: "Tạo CTV", exact: true }).click();
  await expect(page).toHaveURL(/\?created=1$/);
  await page.goto(`/admin/affiliates?q=${code}`);
  await page.getByTestId("affiliate-row").getByRole("link", { name: "Sửa", exact: true }).click();
  await expect(page).toHaveURL(/#profile$/);
  const profile = page.locator("#profile");
  await profile.getByLabel("Tên", { exact: true }).fill(`Updated ${code}`);
  await profile.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(profile.getByRole("status")).toHaveText("Đã lưu");
  await page.goto(`/admin/affiliates?q=${code}`);
  const row = page.getByTestId("affiliate-row");
  await expect(row).toContainText(`Updated ${code}`);
  page.once("dialog", (d) => d.dismiss());
  await row.getByRole("button", { name: "Xoá CTV", exact: true }).click();
  await expect(row).toHaveCount(1);
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Xoá CTV", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/affiliates$/);
  await page.goto(`/admin/affiliates?q=${code}`);
  await expect(page.getByTestId("affiliate-row")).toHaveCount(0);
});

test("admin: khóa CTV từ danh sách → CTV không đăng nhập được; mở khóa → đăng nhập lại được", async ({ page, browser }) => {
  const code = `LCK${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const email = `${code.toLowerCase()}@ctv.glow.local`;
  const password = "ctv-mat-khau-12";
  await login(page, "admin@glow.local");
  await page.goto("/admin/affiliates/new");
  await page.getByLabel("Tên", { exact: true }).fill(`CTV ${code}`);
  await page.getByLabel("Email đăng nhập").fill(email);
  await page.getByLabel("Số điện thoại").fill("09 7812 0000");
  await page.getByLabel("Mã giới thiệu").fill(code);
  await page.getByLabel("Hoa hồng (%)").fill("10");
  await page.getByLabel("Mật khẩu tạm").fill(password);
  await page.getByRole("button", { name: "Tạo CTV", exact: true }).click();
  await expect(page).toHaveURL(/\?created=1$/);

  await page.goto(`/admin/affiliates?q=${code}`);
  const row = page.getByTestId("affiliate-row");
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Khoá CTV", exact: true }).click();
  await expect(row.getByRole("button", { name: "Mở khoá", exact: true })).toBeVisible();
  await expect(row).toContainText("Đã khoá");

  const ctvContext = await browser.newContext();
  const ctv = await ctvContext.newPage();
  try {
    await ctv.context().addCookies([{ name: "CTV_LOCALE", value: "vi", url: `${test.info().project.use.baseURL}/ctv` }]);
    await ctv.goto("/ctv/login");
    await ctv.getByLabel("Email").fill(email);
    await ctv.getByLabel("Mật khẩu", { exact: true }).fill(password);
    await ctv.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(ctv.getByRole("alert").filter({ hasText: "Tài khoản đã bị khoá" })).toBeVisible();

    await row.getByRole("button", { name: "Mở khoá", exact: true }).click();
    await expect(row.getByRole("button", { name: "Khoá CTV", exact: true })).toBeVisible();
    await expect(row).not.toContainText("Đã khoá");

    await ctv.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(ctv.getByTestId("ctv-user")).toBeVisible();
  } finally {
    await ctvContext.close();
  }
});
