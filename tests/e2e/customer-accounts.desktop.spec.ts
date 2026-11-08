import { expect, test } from "@playwright/test";
import pg from "pg";
import { login } from "./helpers";

test("tài khoản khách: icon Sửa/Khoá/Xoá như Nhân viên, CTV; trang sửa tên + SĐT; bố cục mobile", async ({ page }) => {
  test.setTimeout(90_000);
  const tag = `customer-ui-${Date.now()}`;
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const ids = ["phone", "google", "email"].map((kind) => `${tag}-${kind}`);
  const phoneNo = `097${String(Date.now()).slice(-8)}`;
  try {
    for (const [i, name] of ["Aye Aye", "Min Thu", "Hnin Pwint"].entries()) {
      await client.query(
        `INSERT INTO "user" (id, name, email, "emailVerified", role, locale, active, "createdAt", "updatedAt", "phoneNumber")
         VALUES ($1, $2, $3, true, 'CUSTOMER', 'en', $4, NOW(), NOW(), $5)`,
        [ids[i], name, i === 0 ? `${phoneNo}@phone.glow.invalid` : `${ids[i]}@example.test`, i !== 2, i === 0 ? phoneNo : null],
      );
      await client.query(
        `INSERT INTO "account" (id, "accountId", "providerId", "userId", "createdAt", "updatedAt")
         VALUES ($1, $1, $2, $3, NOW(), NOW())`,
        [`${ids[i]}-account`, i === 1 ? "google" : "credential", ids[i]],
      );
    }
    await login(page, "admin@glow.local");
    await page.goto(`/admin/customer-accounts?q=${tag}`);
    const rows = page.getByTestId("customer-row");
    await expect(rows).toHaveCount(2); // tài khoản SĐT có email nội bộ nên không khớp tag
    const google = rows.filter({ hasText: "Min Thu" });
    const locked = rows.filter({ hasText: "Hnin Pwint" });

    // Cùng bộ icon: Sửa (link) · Khoá/Mở khoá · Xoá (chưa có đơn).
    await expect(google.getByRole("link", { name: "Sửa", exact: true })).toBeVisible();
    await expect(google.getByRole("button", { name: "Khoá tài khoản", exact: true })).toBeVisible();
    await expect(google.getByRole("button", { name: "Xoá tài khoản", exact: true })).toBeVisible();
    await expect(locked.getByRole("button", { name: "Mở khoá tài khoản", exact: true })).toBeVisible();
    expect((await google.boundingBox())!.height).toBeLessThan(120);
    await page.screenshot({ path: "test-results/screens/customer-accounts-desktop.png", fullPage: true, animations: "disabled" });

    page.once("dialog", (dialog) => dialog.accept());
    await google.getByRole("button", { name: "Khoá tài khoản", exact: true }).click();
    await expect(google.getByRole("button", { name: "Mở khoá tài khoản", exact: true })).toBeVisible();
    await google.getByRole("button", { name: "Mở khoá tài khoản", exact: true }).click();
    await expect(google.getByRole("button", { name: "Khoá tài khoản", exact: true })).toBeVisible();

    // Trang sửa: tài khoản SĐT sửa được tên + số; tài khoản Google không có ô SĐT / mật khẩu.
    await page.goto(`/admin/customer-accounts/${ids[0]}`);
    const main = page.getByRole("main");
    await expect(main.getByLabel("Số điện thoại")).toHaveValue(phoneNo);
    await main.getByLabel("Tên", { exact: true }).fill("Aye Aye Mới");
    await main.getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(main.getByRole("status").filter({ hasText: "Đã lưu" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Aye Aye Mới");
    await page.goto(`/admin/customer-accounts/${ids[1]}`);
    await expect(main.getByLabel("Số điện thoại")).toHaveCount(0);
    await expect(main.getByLabel(/Mật khẩu tạm/)).toHaveCount(0);

    // Xoá từ danh sách (chưa có đơn) → dòng biến mất.
    await page.goto(`/admin/customer-accounts?q=${tag}`);
    page.once("dialog", (dialog) => dialog.accept());
    await google.getByRole("button", { name: "Xoá tài khoản", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/customer-accounts$/);
    await page.goto(`/admin/customer-accounts?q=${tag}`);
    await expect(rows.filter({ hasText: "Min Thu" })).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/screens/customer-accounts-mobile.png", fullPage: true, animations: "disabled" });
  } finally {
    await client.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [ids]);
    await client.end();
  }
});
