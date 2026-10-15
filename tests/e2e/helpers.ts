import { expect, type Page } from "@playwright/test";
import pg from "pg";

export const PASSWORD = process.env.SEED_STAFF_PASSWORD!;

/**
 * Xoá bộ đếm chống dò mật khẩu (10 lần đăng nhập/phút/IP) trên DB test —
 * bộ E2E đổi vai trò nhiều lần trong một phút. Chỉ chạy với DATABASE_URL của .env.test (glow_test).
 */
async function resetLoginRateLimit() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('DELETE FROM "rateLimit"');
  } finally {
    await client.end();
  }
}

/** Đăng nhập admin bằng tài khoản seed (*@glow.local). Xoá phiên cũ trước để đổi vai trò được. */
export async function login(page: Page, email: string) {
  await resetLoginRateLimit();
  await page.context().clearCookies();
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu").fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByTestId("role")).toBeVisible();
}
