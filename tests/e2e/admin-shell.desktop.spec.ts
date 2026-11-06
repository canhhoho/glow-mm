import { expect, test } from "@playwright/test";
import { login, openAdminGroup } from "./helpers";

// P9a: khung admin trên desktop — menu cố định bên trái, không có nút ☰, breadcrumb "Nhóm › Mục".

test("desktop: menu luôn hiện, breadcrumb theo nhóm", async ({ page }) => {
  await login(page, "admin@glow.local");
  const nav = page.getByRole("navigation", { name: "Admin" });
  await expect(nav).toBeVisible();
  await expect(page.getByRole("button", { name: "Mở menu" })).toBeHidden();

  await openAdminGroup(page, "Kho hàng");
  await nav.getByRole("link", { name: "Tồn kho" }).click();
  await expect(page).toHaveURL(/\/admin\/inventory$/);
  await expect(page.getByRole("navigation", { name: "Vị trí trang" })).toHaveText(/Kho hàng\s*Tồn kho/);
  await expect(nav.getByRole("link", { name: "Tồn kho" })).toHaveAttribute("aria-current", "page");
  const box = await nav.boundingBox();
  expect(box!.x).toBeLessThan(10);
  expect(box!.width).toBeLessThan(260);
});
