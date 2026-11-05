import { expect, test } from "@playwright/test";
import pg from "pg";
import { login } from "./helpers";

test("dashboard hiện vai trò ngay khi phần số liệu tồn đang bận", async ({ page }) => {
  test.setTimeout(60000);
  await login(page, "admin@glow.local");
  await page.goto("/admin/account");
  const blocker = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await blocker.connect();
  try {
    await blocker.query("BEGIN");
    await blocker.query('LOCK TABLE "StockBalance" IN ACCESS EXCLUSIVE MODE');
    await page.goto("/admin", { waitUntil: "commit" });
    // Header/session không phụ thuộc số liệu kho. Khóa vẫn đang giữ khi kiểm tra.
    await expect(page.getByTestId("role")).toBeVisible({ timeout: 2000 });
    await blocker.query("COMMIT");
    await expect(page.getByTestId("alert-low")).toBeVisible({ timeout: 20000 });
  } finally {
    await blocker.query("ROLLBACK").catch(()=>{});
    await blocker.end();
  }
});
