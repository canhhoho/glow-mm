import { expect, test, type Page } from "@playwright/test";
import { login, pickAddressAdmin } from "./helpers";

const VARIANT = "SV-SUN-50 — Sunscreen SPF50 PA++++ (50ml)";

async function newCodOrder(page: Page, phone: string, name: string) {
  await page.goto(`/admin/orders/new?phone=${encodeURIComponent(phone)}`);
  await page.getByLabel("Tên người nhận").fill(name);
  await pickAddressAdmin(page);
  await page.getByLabel("Địa chỉ").fill("No. 5, Insein Rd");
  const option = page.getByLabel("Biến thể").locator("option", { hasText: VARIANT });
  await page.getByLabel("Biến thể").selectOption((await option.getAttribute("value"))!);
  await page.getByLabel("SL", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Tạo đơn" }).click();
  await expect(page).toHaveURL(/\/admin\/orders\/(?!new$)[^/?]+$/);
  await expect(page.getByTestId("order-status")).toContainText("Chờ xác nhận");
  return (await page.getByRole("heading", { level: 1 }).textContent())!.split(" ").pop()!;
}

test("DT: chọn nhiều đơn → xác nhận COD hàng loạt → in phiếu lấy hàng + nhãn", async ({ page }) => {
  test.setTimeout(120_000);
  const phone = `0978${String(Date.now()).slice(-6)}`;
  await login(page, "admin@glow.local");
  const codes = [await newCodOrder(page, phone, "Bulk A"), await newCodOrder(page, phone, "Bulk B")];

  await page.goto(`/admin/orders?q=${phone}`);
  const bar = page.getByTestId("bulk-bar");
  for (const code of codes) await page.getByLabel(`Chọn đơn ${code}`).check();
  await expect(bar.getByTestId("bulk-count")).toHaveText("Đã chọn 2 đơn");

  // Phiếu lấy hàng gộp: 2 đơn × 1 = 2 món cùng SKU.
  const [pick] = await Promise.all([page.waitForEvent("popup"), bar.getByRole("button", { name: "In phiếu lấy hàng" }).click()]);
  await expect(pick.getByRole("heading", { name: "Phiếu lấy hàng" })).toBeVisible();
  await expect(pick.getByTestId("pick-line").filter({ hasText: "SV-SUN-50" })).toContainText(`${codes[0]}×1`);
  await pick.screenshot({ path: "test-results/screens/pick-list.png", fullPage: true });
  await pick.close();
  const [labels] = await Promise.all([page.waitForEvent("popup"), bar.getByRole("button", { name: "In nhãn" }).click()]);
  await expect(labels.getByTestId("order-label")).toHaveCount(2);
  await labels.close();

  page.once("dialog", (d) => d.accept());
  await bar.getByRole("button", { name: "Xác nhận đơn COD" }).click();
  await expect(bar.getByTestId("bulk-result")).toContainText("Đã xử lý 2/2 đơn.");
  await expect(bar.getByTestId("bulk-count")).toHaveText("Đã chọn 0 đơn");
  await page.screenshot({ path: "test-results/screens/bulk-orders.png", fullPage: true });

  // Đã xác nhận rồi → chạy lại báo lỗi từng đơn, không đổi gì.
  for (const code of codes) await page.getByLabel(`Chọn đơn ${code}`).check();
  page.once("dialog", (d) => d.accept());
  await bar.getByRole("button", { name: "Xác nhận đơn COD" }).click();
  await expect(bar.getByTestId("bulk-result")).toContainText("Đã xử lý 0/2 đơn.");

  // Nhả hàng để lần chạy sau vẫn còn tồn.
  for (const code of codes) {
    await page.goto(`/admin/orders?q=${code}`);
    await page.getByRole("link", { name: code }).click();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Huỷ đơn" }).click();
    await expect(page.getByTestId("order-status")).toContainText("Đã huỷ");
  }
});
