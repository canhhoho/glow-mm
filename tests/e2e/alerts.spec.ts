import { expect, test } from "@playwright/test";
import { login, openAdminGroup } from "./helpers";

test("thủ kho xem cảnh báo: tồn thấp, gợi ý đặt hàng; không còn tab hạn dùng", async ({ page }) => {
  await login(page, "kho@glow.local");
  await (await openAdminGroup(page, "Kho hàng")).getByRole("link", { name: "Tồn kho" }).click();
  await page.getByRole("main").getByRole("link", { name: "Cảnh báo" }).click(); // lối tắt trong trang Tồn kho (không còn mục menu riêng)
  await expect(page).toHaveURL(/\/admin\/alerts(?:\?.*)?$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Cảnh báo kho", level: 1 })).toBeVisible();

  // Seed: ML-LIP-02 chỉ có 4 cái (ngưỡng 5).
  await expect(page.getByTestId("alert-row").filter({ hasText: "ML-LIP-02" })).toBeVisible();

  // Hạn dùng đang tắt (`FEATURES.expiry`, 17/11/2026): không còn tab Hạn dùng (bật lại cờ thì khôi phục kiểm lô C2602 ngừng bán).
  await expect(page.getByRole("main").getByRole("link", { name: /Hạn dùng/ })).toHaveCount(0);

  await page.getByRole("link", { name: /Gợi ý đặt hàng/ }).click();
  await expect(page.getByText(/Nên đặt = bán\/ngày/)).toBeVisible();
});
