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
  for (const group of ["Đơn hàng", "Sản phẩm", "Kho hàng", "Báo cáo", "Cài đặt"]) {
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

test("mục gộp tab (Tài khoản, CTV & hoa hồng, Nội dung website) mở đúng trang, đánh dấu mục và mở nhóm hiện tại", async ({ page }) => {
  await login(page, "admin@glow.local");

  // Cài đặt › Tài khoản = hai tab Nhân viên / Khách hàng ("Tài khoản" có thể kèm số yêu cầu đặt lại mật khẩu).
  let nav = await openAdminGroup(page, "Cài đặt");
  await nav.getByRole("link", { name: /^Tài khoản/ }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  const accountTabs = page.getByRole("navigation", { name: "Tài khoản", exact: true });
  await expect(accountTabs.getByRole("link", { name: "Nhân viên", exact: true })).toHaveAttribute("aria-current", "page");
  await accountTabs.getByRole("link", { name: /^Khách hàng/ }).click();
  await expect(page).toHaveURL(/\/admin\/customer-accounts$/);
  nav = await openAdminNav(page);
  await expect(nav.getByRole("link", { name: /^Tài khoản/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("navigation", { name: "Vị trí trang" })).toContainText("Tài khoản");
  await page.keyboard.press("Escape");

  // Đơn hàng › CTV & hoa hồng = ba tab; chuyển tab không đổi mục menu đang sáng.
  nav = await openAdminGroup(page, "Đơn hàng");
  await nav.getByRole("link", { name: /^CTV & hoa hồng/ }).click();
  await expect(page).toHaveURL(/\/admin\/affiliates$/);
  const affiliateTabs = page.getByRole("navigation", { name: "CTV & hoa hồng", exact: true });
  await expect(affiliateTabs.getByRole("link", { name: "Danh sách CTV", exact: true })).toHaveAttribute("aria-current", "page");
  await affiliateTabs.getByRole("link", { name: "Hoa hồng & chi trả", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/affiliates\/commissions$/);
  nav = await openAdminNav(page);
  await expect(nav.getByRole("link", { name: /^CTV & hoa hồng/ })).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Escape");

  // Cài đặt › Nội dung website = Banner / Bộ sưu tập.
  await page.goto("/admin/content/collections");
  nav = await openAdminNav(page);
  await expect(nav.getByRole("link", { name: "Nội dung website", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("navigation", { name: "Vị trí trang" })).toContainText("Nội dung website");
  await expect(page.getByRole("navigation", { name: "Nội dung website", exact: true }).getByRole("link", { name: "Bộ sưu tập" })).toHaveAttribute("aria-current", "page");
});

test("trang lối tắt cũ vẫn sáng đúng mục menu mới", async ({ page }) => {
  await login(page, "admin@glow.local");
  for (const [path, item] of [
    ["/admin/orders/preorders", "Danh sách đơn"],
    ["/admin/alerts", "Tồn kho"],
    ["/admin/inventory/quarantine", "Tồn kho"],
  ] as const) {
    await page.goto(path);
    const nav = await openAdminNav(page);
    await expect(nav.getByRole("link", { name: new RegExp(`^${item}`) }), path).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Escape");
  }
});
