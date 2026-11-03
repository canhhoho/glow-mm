import { expect, test } from "@playwright/test";
import pg from "pg";
import { login } from "./helpers";

test("tài khoản khách: bảng gọn, mở mật khẩu khi cần, khoá/mở và bố cục mobile", async ({ page }) => {
  test.setTimeout(90_000);
  const tag = `customer-ui-${Date.now()}`;
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const ids = ["phone", "google", "email"].map((kind) => `${tag}-${kind}`);
  try {
    for (const [i, name] of ["Aye Aye", "Min Thu", "Hnin Pwint"].entries()) {
      await client.query(
        `INSERT INTO "user" (id, name, email, "emailVerified", role, locale, active, "createdAt", "updatedAt", "phoneNumber")
         VALUES ($1, $2, $3, true, 'CUSTOMER', 'en', $4, NOW(), NOW(), $5)`,
        [ids[i], name, `${ids[i]}@example.test`, i !== 2, i === 0 ? "09781234567" : null],
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
    await expect(rows).toHaveCount(3);
    const phone = rows.filter({ hasText: "Aye Aye" });
    const google = rows.filter({ hasText: "Min Thu" });
    const locked = rows.filter({ hasText: "Hnin Pwint" });
    const panel = phone.getByTestId("customer-password-panel");
    await expect(phone.getByPlaceholder(/Mật khẩu tạm/)).toBeHidden();
    await expect(google.getByTestId("customer-password-panel")).toHaveCount(0);
    const rowBox = await phone.boundingBox();
    expect(rowBox!.height).toBeLessThan(120);
    const passwordBox = await locked.locator("summary").boundingBox();
    const unlockBox = await locked.getByRole("button", { name: "Mở khoá", exact: true }).boundingBox();
    expect(Math.abs(passwordBox!.y - unlockBox!.y)).toBeLessThan(2);
    await page.screenshot({ path: "test-results/screens/customer-accounts-desktop.png", fullPage: true, animations: "disabled" });

    await panel.locator("summary").click();
    await expect(phone.getByPlaceholder(/Mật khẩu tạm/)).toBeVisible();
    await panel.locator("summary").click();
    page.once("dialog", (dialog) => dialog.accept());
    await phone.getByRole("button", { name: "Khoá", exact: true }).click();
    await expect(phone.getByRole("button", { name: "Mở khoá", exact: true })).toBeVisible();
    await phone.getByRole("button", { name: "Mở khoá", exact: true }).click();
    await expect(phone.getByRole("button", { name: "Khoá", exact: true })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    const menu = page.getByRole("button", { name: "Mở menu", exact: true });
    await expect(menu).toBeVisible();
    if ((await menu.getAttribute("aria-expanded")) === "true") await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/screens/customer-accounts-mobile.png", fullPage: true, animations: "disabled" });
    await panel.locator("summary").click();
    await expect(phone.getByPlaceholder(/Mật khẩu tạm/)).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    await client.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [ids]);
    await client.end();
  }
});
