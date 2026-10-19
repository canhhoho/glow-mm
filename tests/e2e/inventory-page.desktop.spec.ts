import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// P9c: trang Tồn kho trên desktop — bảng theo sản phẩm, dòng mở rộng xem lô.

test("desktop: bảng theo sản phẩm, mở dòng xem lô", async ({ page }) => {
  await login(page, "kho@glow.local");
  await page.goto("/admin/inventory?q=SV-SUN-50");
  const row = page.getByTestId("stock-row").filter({ hasText: "SV-SUN-50" });
  await expect(row).toHaveCount(1);
  await expect(page.getByTestId("stock-card")).toBeHidden(); // thẻ chỉ dùng trên mobile

  const toggle = row.getByRole("button", { name: "Xem lô: SV-SUN-50" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  // getByRole bỏ qua bảng lô trong thẻ mobile (đang ẩn).
  const lots = page.getByRole("table").getByTestId("lot-row");
  await expect(lots.first()).toBeVisible();
  await toggle.click();
  await expect(lots).toHaveCount(0);
});
