import { expect, test, type Page } from "@playwright/test";
import { login, pickAddressAdmin } from "./helpers";

// P13: admin đặt % tầng trên riêng cho cấp trên (MAUNG) → đơn của tuyến dưới (LINN) chốt % đó;
// admin chỉnh % tầng trên trên đơn chưa chi trả → hoa hồng tầng trên tính lại (hoa hồng bán hàng theo mức ở Giá bán).

const VARIANT = "SV-SUN-50 — Sunscreen SPF50 PA++++ (50ml)";

async function setMaungUpline(page: Page, value: string) {
  await page.goto("/admin/affiliates?q=MAUNG");
  await page.getByTestId("affiliate-row").filter({ hasText: "MAUNG" }).getByRole("link").first().click();
  await page.getByLabel("% hưởng từ tuyến dưới").fill(value);
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Đã lưu" })).toBeVisible();
}

test("admin: % tầng trên riêng + chỉnh % trên đơn chưa chi trả", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "admin@glow.local");
  await setMaungUpline(page, "3");
  try {
    // Nhân viên tạo đơn tay, gán CTV cấp dưới LINN → cấp trên MAUNG hưởng 3%.
    await page.goto("/admin/orders/new?phone=09%207812%205555");
    await page.getByLabel("Tên người nhận").fill("Ma Rate");
    await pickAddressAdmin(page);
    await page.getByLabel("Địa chỉ").fill("No. 3, Rate Road");
    const option = page.getByLabel("SKU / Phân loại").locator("option", { hasText: VARIANT });
    await page.getByLabel("SKU / Phân loại").selectOption((await option.getAttribute("value"))!);
    await page.getByLabel("SL", { exact: true }).fill("1");
    await page.getByLabel("CTV (không bắt buộc)").selectOption({ label: "LINN — Ko Lin (CTV cấp dưới)" });
    await page.getByRole("button", { name: "Tạo đơn" }).click();
    await expect(page).toHaveURL(/\/admin\/orders\/[^/]+$/);
    await expect(page.getByTestId("order-upline")).toContainText("MAUNG");
    await expect(page.getByTestId("order-upline")).toContainText("(3%)");

    // 18/11/2026: hoa hồng bán hàng theo mức ở Giá bán (Sunscreen mẫu 2 500 MMK/cái) — không còn ô % bán hàng trên đơn.
    // Chỉ chỉnh % tầng trên: 4% (đơn 25 000 MMK → 1 000); hoa hồng bán hàng giữ 2 500.
    const rates = page.getByTestId("order-rates");
    await expect(rates.getByLabel("% hoa hồng CTV")).toHaveCount(0);
    await rates.getByLabel("% tầng trên").fill("4");
    await page.getByRole("button", { name: "Lưu %" }).click();
    await expect(page.getByText("Đã cập nhật %")).toBeVisible();
    const section = page.getByTestId("order-affiliate");
    await expect(section).toContainText("2,500 MMK");
    await expect(section).toContainText("theo hoa hồng ở Giá bán");
    await expect(page.getByTestId("order-upline")).toContainText("1,000 MMK");
    await expect(page.getByTestId("order-upline")).toContainText("(4%)");
  } finally {
    await setMaungUpline(page, "");
  }
});
