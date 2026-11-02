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
  await page.getByRole("button", { name: "Đã gọi xác nhận COD" }).click();
  await expect(page.getByTestId("order-status")).toContainText("Đã xác nhận COD");
  const from = page.getByLabel("Kho xuất");
  if (await from.count()) await from.selectOption({ label: "MM-STOCK — Kho Yangon" });
  await page.getByRole("button", { name: "Đóng gói (trừ kho FEFO)" }).click();
  await expect(page.getByTestId("order-status")).toContainText("Đang đóng gói");
  await page.getByLabel("Đơn vị vận chuyển").fill("Royal Express");
  await page.getByRole("button", { name: "Giao cho vận chuyển" }).click();
  await expect(page.getByTestId("order-status")).toContainText("Đang giao");
  await page.getByRole("button", { name: "Hoàn tất (đã giao)" }).click();
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
});
