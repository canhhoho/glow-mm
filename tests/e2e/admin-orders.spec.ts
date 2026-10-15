import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

const VARIANT = "SV-SUN-50 — Sunscreen SPF50 PA++++ (50ml)";

async function expectStatus(page: Page, text: string) {
  await expect(page.getByTestId("order-status")).toContainText(text);
}

test("đơn thủ công (Facebook, COD): tạo → xác nhận → đóng gói FEFO → giao → hoàn tất", async ({ page }) => {
  // Nhân viên đơn hàng tạo đơn từ tin nhắn Facebook.
  await login(page, "donhang@glow.local");
  await page.goto("/admin/orders/new?phone=09%207812%203456");
  await expect(page.getByTestId("customer-lookup")).toBeVisible();

  await page.getByLabel("Tên người nhận").fill("Ma Hla Hla");
  await page.getByLabel("Khu vực").selectOption({ index: 1 });
  await page.getByLabel("Địa chỉ").fill("No. 12, Bo Aung Kyaw St");
  const option = page.getByLabel("Biến thể").locator("option", { hasText: VARIANT });
  await page.getByLabel("Biến thể").selectOption((await option.getAttribute("value"))!);
  await page.getByLabel("SL").fill("1");
  await page.getByRole("button", { name: "Tạo đơn" }).click();

  await expect(page).toHaveURL(/\/admin\/orders\/[^/]+$/);
  await expectStatus(page, "Chờ xác nhận");
  const orderUrl = page.url();
  const code = (await page.getByRole("heading", { level: 1 }).textContent())!.split(" ").pop()!;
  await expect(page.getByRole("button", { name: "Đóng gói (trừ kho FEFO)" })).toHaveCount(0); // không có quyền

  await page.getByRole("button", { name: "Đã gọi xác nhận COD" }).click();
  await expectStatus(page, "Đã xác nhận COD");

  // Danh sách: tìm theo mã đơn.
  await page.goto(`/admin/orders?q=${code}`);
  await expect(page.getByRole("link", { name: code })).toBeVisible();

  // Thủ kho đóng gói: trừ kho theo FEFO tại kho Yangon.
  await login(page, "kho@glow.local");
  await page.goto(orderUrl);
  const from = page.getByLabel("Kho xuất");
  if (await from.count()) await from.selectOption({ label: "MM-STOCK — Kho Yangon" });
  await page.getByRole("button", { name: "Đóng gói (trừ kho FEFO)" }).click();
  await expectStatus(page, "Đang đóng gói");
  await expect(page.getByRole("link", { name: /^IS-/ })).toBeVisible();

  // Nhân viên đơn hàng giao cho vận chuyển, in nhãn, hoàn tất.
  await login(page, "donhang@glow.local");
  await page.goto(orderUrl);
  await page.getByLabel("Đơn vị vận chuyển").fill("Royal Express");
  await page.getByLabel("Mã vận đơn").fill("RX-E2E-1");
  await page.getByRole("button", { name: "Giao cho vận chuyển" }).click();
  await expectStatus(page, "Đang giao");
  await page.screenshot({ path: "test-results/screens/admin-order-detail.png", fullPage: true });

  await page.getByRole("link", { name: "In nhãn ship" }).click();
  // Next giữ trang trước (ẩn) trong DOM → giới hạn trong nhãn.
  const label = page.getByRole("article");
  await expect(label.getByText("Thu hộ (COD)")).toBeVisible();
  await expect(label.getByText("RX-E2E-1")).toBeVisible();
  await page.screenshot({ path: "test-results/screens/admin-order-label.png", fullPage: true });

  await page.goto(orderUrl);
  await page.getByRole("button", { name: "Hoàn tất (đã giao)" }).click();
  await expectStatus(page, "Hoàn tất");
  await expectStatus(page, "Đã thanh toán");

  // Khách trả lại 1 món → hàng vào khu Chờ kiểm tra (MM-QC); trả hết nên đơn → Trả hàng.
  await page.getByLabel("Trả hàng SV-SUN-50").fill("1");
  const qc = page.getByLabel("Vị trí chờ kiểm tra");
  if (await qc.count()) {
    const value = await qc.locator("option", { hasText: "MM-QC" }).getAttribute("value");
    await qc.selectOption(value!);
  }
  await page.getByLabel("Lý do trả").fill("Khách đổi ý");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Ghi nhận trả hàng" }).click();
  await expectStatus(page, "Trả hàng");
  await page.screenshot({ path: "test-results/screens/order-returned.png", fullPage: true });

  // Thủ kho kiểm tra xong → nhập lại kho bán.
  await login(page, "kho@glow.local");
  await page.goto("/admin/inventory/quarantine");
  const row = page.getByTestId("quarantine-row").filter({ has: page.getByRole("link", { name: code }) });
  await expect(row).toBeVisible();
  await page.screenshot({ path: "test-results/screens/quarantine.png", fullPage: true });
  await row.getByLabel("Nhập vào").selectOption({ label: "MM-STOCK" });
  await row.getByRole("button", { name: "Nhập lại kho bán" }).click();
  await expect(page.getByTestId("quarantine-row").filter({ has: page.getByRole("link", { name: code }) })).toHaveCount(0);
});

test("huỷ đơn thủ công nhả hàng; lỗi hiển thị khi đặt quá tồn", async ({ page }) => {
  await login(page, "donhang@glow.local");
  await page.goto("/admin/orders/new");
  await page.getByLabel("Tên người nhận").fill("Ko Aung");
  await page.getByLabel("SĐT", { exact: true }).fill("09 4500 1234");
  await page.getByLabel("Khu vực").selectOption({ index: 1 });
  await page.getByLabel("Địa chỉ").fill("Hlaing Township");
  // ML-LIP-02 chỉ có 4 cái trong seed và không test nào bán → luôn vượt tồn được, không phụ thuộc lần chạy trước.
  const option = page.getByLabel("Biến thể").locator("option", { hasText: "ML-LIP-02" });
  await page.getByLabel("Biến thể").selectOption((await option.getAttribute("value"))!);

  // Vượt tồn: bỏ giới hạn max của ô số lượng để kiểm tra lỗi từ server.
  await page.getByLabel("SL").evaluate((el) => el.removeAttribute("max"));
  await page.getByLabel("SL").fill("5");
  await page.getByRole("button", { name: "Tạo đơn" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Không đủ hàng" })).toBeVisible();

  await page.getByLabel("SL").fill("1");
  await page.getByRole("button", { name: "Tạo đơn" }).click();
  await expectStatus(page, "Chờ xác nhận");
  page.once("dialog", (d) => d.accept());
  await page.getByLabel("Lý do").fill("Khách đổi ý");
  await page.getByRole("button", { name: "Huỷ đơn" }).click();
  await expectStatus(page, "Đã huỷ");
  await expect(page.getByText("Khách đổi ý").first()).toBeVisible();
});
