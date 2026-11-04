import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { readSheet } from "read-excel-file/node";
import { login, pickAddressAdmin } from "./helpers";

const VARIANT = "SV-SUN-50 — Sunscreen SPF50 PA++++ (50ml)";

async function expectStatus(page: Page, text: string) {
  await expect(page.getByTestId("order-status")).toContainText(text);
}

test("đơn thủ công (Facebook, COD): tạo → xác nhận → bàn giao (FEFO) → hoàn tất", async ({ page }) => {
  test.setTimeout(120_000); // gồm xuất VTP, bàn giao, trả hàng và nhập lại kho
  // Nhân viên đơn hàng tạo đơn từ tin nhắn Facebook.
  await login(page, "donhang@glow.local");
  await page.goto("/admin/orders/new?phone=09%207812%203456");
  await expect(page.getByTestId("customer-lookup")).toBeVisible();

  await page.getByLabel("Tên người nhận").fill("Ma Hla Hla");
  await pickAddressAdmin(page);
  await page.getByLabel("Địa chỉ").fill("No. 12, Bo Aung Kyaw St");
  const option = page.getByLabel("Biến thể").locator("option", { hasText: VARIANT });
  await page.getByLabel("Biến thể").selectOption((await option.getAttribute("value"))!);
  await page.getByLabel("SL", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Tạo đơn" }).click();

  await expect(page).toHaveURL(/\/admin\/orders\/[^/]+$/);
  await expectStatus(page, "Chờ xác nhận");
  const orderUrl = page.url();
  const code = (await page.getByRole("heading", { level: 1 }).textContent())!.split(" ").pop()!;
  await expect(page.getByRole("button", { name: "Đóng gói (trừ kho FEFO)" })).toHaveCount(0); // không có quyền

  await page.getByRole("button", { name: "Xác nhận đơn" }).click();
  await expectStatus(page, "Chuẩn bị giao");

  // Thông tin đơn lẻ và file VTP lấy từ đúng đơn; xuất file không bàn giao hay thu COD.
  const expectedCod = Number((await page.getByTestId("order-total").textContent())!.replace(/[^0-9]/g, ""));
  const singleInfo = page.getByTestId("vtp-single-info");
  await singleInfo.locator("summary").click();
  await expect(singleInfo.getByLabel("Số điện thoại", { exact: true })).toHaveValue("0978123456");
  await expect(singleInfo.getByLabel("Họ tên người nhận", { exact: true })).toHaveValue("Ma Hla Hla");
  await expect(singleInfo.getByLabel("Thu hộ COD (MMK)", { exact: true })).toHaveValue(String(expectedCod));
  await page.getByRole("link", { name: "Xuất Excel VTP", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/orders\/export\?id=/);
  await page.getByRole("combobox", { name: "Dịch vụ VTP", exact: true }).selectOption("VNM - Normal Intra City");
  await page.getByLabel(`Khối lượng (g) ${code}`, { exact: true }).fill("250");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Tải Excel VTP (1 đơn)", exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/^VTP-orders-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const workbookPath = await download.path();
  expect(workbookPath).not.toBeNull();
  const exportRows = await readSheet(await readFile(workbookPath!), "Order list");
  expect(exportRows).toHaveLength(8); // bảy dòng tiêu đề + một đơn được chọn
  expect(exportRows[6]).toHaveLength(21);
  expect(exportRows[7].slice(0, 4)).toEqual([1, code, "Ma Hla Hla", "0978123456"]);
  expect(exportRows[7][9]).toBe(250);
  expect(exportRows[7][11]).toBe(expectedCod);
  expect(exportRows[7][13]).toBe("VNM - Normal Intra City");
  await page.goto(orderUrl);
  await expectStatus(page, "Chuẩn bị giao");
  await expectStatus(page, "Chưa trả");

  // Danh sách: tìm theo mã đơn.
  await page.goto(`/admin/orders?q=${code}`);
  await expect(page.getByRole("link", { name: code })).toBeVisible();

  // Nhân viên bàn giao: tự xuất kho FEFO, không cần thao tác đóng gói riêng.
  await page.goto(orderUrl);
  await expect(page.getByRole("button", { name: "Đóng gói (trừ kho FEFO)" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "In nhãn ship" })).toBeVisible();
  const from = page.getByLabel("Kho xuất");
  if (await from.count()) await from.selectOption({ label: "MM-STOCK — Kho Yangon" });
  await page.getByLabel("Đơn vị vận chuyển").fill("Royal Express");
  await page.getByLabel("Mã vận đơn").fill("RX-E2E-1");
  await page.getByRole("button", { name: "Đã bàn giao vận chuyển" }).click();
  await expectStatus(page, "Đang giao");
  await expect(page.getByRole("link", { name: /^IS-/ })).toBeVisible();
  await page.screenshot({ path: "test-results/screens/admin-order-detail.png", fullPage: true });

  await page.getByRole("link", { name: "In nhãn ship" }).click();
  // Next giữ trang trước (ẩn) trong DOM → giới hạn trong nhãn.
  const label = page.getByRole("article");
  await expect(label.getByText("Thu hộ (COD)")).toBeVisible();
  await expect(label.getByText("RX-E2E-1")).toBeVisible();
  await page.screenshot({ path: "test-results/screens/admin-order-label.png", fullPage: true });

  await page.goto(orderUrl);
  await page.getByRole("button", { name: "Giao thành công · Đã thu tiền" }).click();
  await expectStatus(page, "Hoàn tất");
  await expectStatus(page, "Đã thanh toán");
  await expect(page.getByText("Chờ tiền về cửa hàng", { exact: false }).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Xác nhận tiền đã về cửa hàng", exact: true })).toHaveCount(0);
  await login(page, "admin@glow.local");
  await page.goto(orderUrl);
  await page.getByLabel("Mã giao dịch / bảng đối soát", { exact: true }).fill(`COD-E2E-${Date.now()}`);
  await page.getByRole("button", { name: "Xác nhận tiền đã về cửa hàng", exact: true }).click();
  await expect(page.getByText(/Hãng đã thu khách lúc:.*Đã về cửa hàng/).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Xác nhận tiền đã về cửa hàng", exact: true })).toHaveCount(0);

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
  // Không chụp full-page: DB test local tích luỹ nhiều dòng "chờ kiểm tra" → trang rất dài, chụp quá 30s.
  await page.screenshot({ path: "test-results/screens/quarantine.png" });
  await row.getByLabel("Nhập vào").selectOption({ label: "MM-STOCK" });
  await row.getByRole("button", { name: "Nhập lại kho bán" }).click();
  await expect(page.getByTestId("quarantine-row").filter({ has: page.getByRole("link", { name: code }) })).toHaveCount(0, { timeout: 20_000 });
});

test("huỷ đơn thủ công nhả hàng; lỗi hiển thị khi đặt quá tồn", async ({ page }) => {
  await login(page, "donhang@glow.local");
  await page.goto("/admin/orders/new");
  await page.getByLabel("Tên người nhận").fill("Ko Aung");
  await page.getByLabel("SĐT", { exact: true }).fill("09 4500 1234");
  await pickAddressAdmin(page);
  await page.getByLabel("Địa chỉ").fill("Hlaing Township");
  // ML-LIP-02 chỉ có 4 cái trong seed và không test nào bán → luôn vượt tồn được, không phụ thuộc lần chạy trước.
  const option = page.getByLabel("Biến thể").locator("option", { hasText: "ML-LIP-02" });
  await page.getByLabel("Biến thể").selectOption((await option.getAttribute("value"))!);

  // Vượt tồn: bỏ giới hạn max của ô số lượng để kiểm tra lỗi từ server.
  await page.getByLabel("SL", { exact: true }).evaluate((el) => el.removeAttribute("max"));
  await page.getByLabel("SL", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Tạo đơn" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Không đủ hàng" })).toBeVisible();

  await page.getByLabel("SL", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Tạo đơn" }).click();
  await expectStatus(page, "Chờ xác nhận");
  page.once("dialog", (d) => d.accept());
  await page.getByLabel("Lý do").fill("Khách đổi ý");
  await page.getByRole("button", { name: "Huỷ đơn" }).click();
  await expectStatus(page, "Đã huỷ");
  await expect(page.getByText("Khách đổi ý").first()).toBeVisible();
});
