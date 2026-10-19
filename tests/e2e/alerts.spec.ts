import { expect, test } from "@playwright/test";
import { login, openAdminNav } from "./helpers";

test("thủ kho xem cảnh báo: tồn thấp, hạn dùng, gợi ý đặt hàng", async ({ page }) => {
  await login(page, "kho@glow.local");
  await (await openAdminNav(page)).getByRole("link", { name: "Cảnh báo" }).click();
  await expect(page.getByRole("heading", { name: "Cảnh báo kho" })).toBeVisible();

  // Seed: ML-LIP-02 chỉ có 4 cái (ngưỡng 5).
  await expect(page.getByTestId("alert-row").filter({ hasText: "ML-LIP-02" })).toBeVisible();

  await page.getByRole("link", { name: /Hạn dùng/ }).click();
  // Seed: lô C2602 (SV-VC-30) hết hạn 2026-12-31 → ngừng bán (hoặc đã hết hạn khi chạy sau ngày đó).
  const c2602 = page.getByTestId("alert-row").filter({ hasText: "C2602" });
  await expect(c2602).toBeVisible();
  await expect(c2602).toContainText(/Ngừng bán|Hết hạn/);
  await page.screenshot({ path: "test-results/screens/alerts-expiry.png", fullPage: true });

  await page.getByRole("link", { name: /Gợi ý đặt hàng/ }).click();
  await expect(page.getByText(/Nên đặt = bán\/ngày/)).toBeVisible();
});
