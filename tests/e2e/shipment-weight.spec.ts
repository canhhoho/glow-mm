import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// 16/11/2026: chuyến hàng tạm tắt (`lib/features.ts` `shipments = false`) — sẽ phát triển sau. Domain + bảng dữ liệu giữ nguyên
// (test tích hợp `shipment-allocation` vẫn chạy); bật lại cờ thì khôi phục spec phân bổ theo kg trong lịch sử git.
test("chuyến hàng đang tắt: không có mục menu, link cũ chuyển về Tồn kho, phiếu nhập không có ô chuyến / cước", async ({ page }) => {
  await login(page, "admin@glow.local");
  await page.goto("/admin");
  await expect(page.getByRole("link", { name: "Chuyến hàng", exact: true })).toHaveCount(0);
  await page.goto("/admin/shipments");
  await expect(page).toHaveURL(/\/admin\/inventory$/);
  await page.goto("/admin/shipments/khong-co");
  await expect(page).toHaveURL(/\/admin\/inventory$/);

  await page.goto("/admin/inventory/documents/new?type=RECEIVE");
  await page.getByLabel("Chọn vị trí nhận").selectOption({ label: "THAM — Kho Thắm" });
  await page.getByRole("checkbox", { name: "Chọn SV-SUN-50", exact: true }).check();
  await page.getByRole("button", { name: "Tiếp tục nhập thông số", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Chuyến hàng", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Cước tạm tính VN → MM (MMK/kg)")).toHaveCount(0);
});
