import { expect, test } from "@playwright/test";
import { login, openAdminNav } from "./helpers";

// P9a: khung admin trên mobile — menu ngăn kéo, nhóm theo quyền, trang đang mở, breadcrumb.

test("mobile: menu ngăn kéo mở/đóng (☰, Esc, bấm nền, đổi trang), đánh dấu trang đang mở", async ({ page }) => {
  await login(page, "admin@glow.local");
  const nav = page.getByRole("navigation", { name: "Admin" });
  const toggle = page.getByRole("button", { name: "Mở menu" });
  await expect(nav).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  // Nhóm + mục theo quyền admin.
  await openAdminNav(page);
  for (const group of ["Bán hàng", "Kho", "Catalog", "Nội dung", "Hệ thống"]) {
    await expect(nav.getByText(group, { exact: true })).toBeVisible();
  }
  await expect(nav.getByRole("link", { name: "Tổng quan" })).toHaveAttribute("aria-current", "page");

  // Esc đóng.
  await page.keyboard.press("Escape");
  await expect(nav).toBeHidden();

  // Bấm nền đóng.
  await openAdminNav(page);
  await page.mouse.click(390, 400); // bên phải ngăn kéo (rộng 288px)
  await expect(nav).toBeHidden();

  // Chọn mục → chuyển trang, ngăn kéo tự đóng, breadcrumb + aria-current theo trang mới.
  await (await openAdminNav(page)).getByRole("link", { name: "Phiếu kho" }).click();
  await expect(page).toHaveURL(/\/admin\/inventory\/documents$/);
  await expect(nav).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Vị trí trang" })).toContainText("Phiếu kho");
  await expect((await openAdminNav(page)).getByRole("link", { name: "Phiếu kho" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Tồn kho" })).not.toHaveAttribute("aria-current", "page");
});

test("nhân viên đơn hàng: chỉ thấy nhóm được phép", async ({ page }) => {
  await login(page, "donhang@glow.local");
  const nav = await openAdminNav(page);
  await expect(nav.getByText("Bán hàng", { exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Chuyến hàng" })).toHaveCount(0);
  await expect(nav.getByText("Catalog", { exact: true })).toHaveCount(0);
  await expect(nav.getByText("Hệ thống", { exact: true })).toHaveCount(0);
});
