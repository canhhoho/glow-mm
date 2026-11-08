import { expect, test } from "@playwright/test";
import { login, openAdminGroup, openAdminNav } from "./helpers";

// P9a: khung admin trên mobile — menu ngăn kéo, nhóm theo quyền, trang đang mở, breadcrumb.

test("mobile: menu ngăn kéo mở/đóng (☰, Esc, bấm nền, đổi trang), đánh dấu trang đang mở", async ({ page }) => {
  await login(page, "admin@glow.local");
  const nav = page.getByRole("navigation", { name: "Admin" });
  const toggle = page.getByRole("button", { name: "Mở menu" });
  await expect(nav).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  // Nhóm + mục theo quyền admin.
  await openAdminNav(page);
  for (const group of ["Đơn hàng", "Sản phẩm", "Kho hàng", "Tài khoản", "Cộng tác viên", "Báo cáo", "Cài đặt"]) {
    await expect(nav.locator(":scope > details > summary").filter({ has: page.getByText(group, { exact: true }) })).toBeVisible();
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
  await (await openAdminGroup(page, "Kho hàng")).getByRole("link", { name: "Phiếu kho" }).click();
  await expect(page).toHaveURL(/\/admin\/inventory\/documents$/);
  await expect(nav).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Vị trí trang" })).toContainText("Phiếu kho");
  await expect((await openAdminNav(page)).getByRole("link", { name: "Phiếu kho" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Tồn kho" })).not.toHaveAttribute("aria-current", "page");
});

test("nhân viên đơn hàng: chỉ thấy nhóm được phép", async ({ page }) => {
  await login(page, "donhang@glow.local");
  const nav = await openAdminNav(page);
  await expect(nav.getByText("Đơn hàng", { exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Chuyến hàng" })).toHaveCount(0);
  await expect(nav.getByText("Sản phẩm", { exact: true })).toHaveCount(0);
  await expect(nav.getByText("Tài khoản", { exact: true })).toHaveCount(0);
  await expect(nav.getByText("Cài đặt", { exact: true })).toHaveCount(0);
});

test("menu tài khoản và nội dung lồng nhau mở đúng trang, tự đánh dấu và mở nhóm hiện tại", async ({ page }) => {
  await login(page, "admin@glow.local");
  let nav = await openAdminGroup(page, "Tài khoản");
  for (const label of ["Nhân viên", "Khách hàng"]) await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Danh sách CTV", exact: true })).toBeHidden();
  nav = await openAdminGroup(page, "Cộng tác viên");
  await nav.getByRole("link", { name: "Danh sách CTV", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/affiliates$/);
  nav = await openAdminNav(page);
  await expect(nav.getByRole("link", { name: "Danh sách CTV", exact: true })).toHaveAttribute("aria-current", "page");
  await page.goto("/admin/content/banners");
  nav = await openAdminNav(page);
  await expect(nav.getByRole("link", { name: "Banner", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Banner", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("navigation", { name: "Vị trí trang" })).toContainText("Banner");
});
