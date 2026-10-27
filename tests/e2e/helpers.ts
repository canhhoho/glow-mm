import { expect, test, type Page } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
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
    await client.query('DELETE FROM "customerRateLimit"');
  } finally {
    await client.end();
  }
}

/** Đăng nhập admin bằng tài khoản seed (*@glow.local). Xoá phiên cũ trước để đổi vai trò được. */
export async function login(page: Page, email: string, password = PASSWORD) {
  await resetLoginRateLimit();
  await page.context().clearCookies();
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByTestId("role")).toBeVisible();
}

/** Đăng nhập cổng CTV (P10c) bằng CTV seed; ép giao diện tiếng Việt (mặc định của cổng CTV là tiếng Myanmar). */
export async function loginCtv(page: Page, email = "ctv@glow.local", password = PASSWORD) {
  await resetLoginRateLimit();
  await page.context().clearCookies();
  const base = test.info().project.use.baseURL ?? process.env.APP_URL;
  await page.context().addCookies([{ name: "CTV_LOCALE", value: "vi", url: `${base}/ctv` }]);
  await page.goto("/ctv/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByTestId("ctv-user")).toBeVisible();
}

/** Menu admin; trên mobile mở ngăn kéo (nút ☰) trước nếu đang đóng. */
export async function openAdminNav(page: Page) {
  const nav = page.getByRole("navigation", { name: "Admin" });
  const toggle = page.getByRole("button", { name: "Mở menu" });
  if ((await toggle.isVisible()) && (await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(nav).toBeVisible();
  return nav;
}

/** PNG đặc một màu size×size (đủ lớn để bộ tối ưu ảnh/next/image và trình duyệt giải mã bình thường). */
export function solidPng(size: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [232, 101, 122]).flat())]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Link trong email mới nhất gửi tới `to` (EMAIL_DRIVER=outbox — playwright.config đặt EMAIL_OUTBOX_DIR tuyệt đối). */
export async function emailLink(to: string, since = 0): Promise<string> {
  const dir = process.env.EMAIL_OUTBOX_DIR!;
  let found: string | undefined;
  await expect
    .poll(
      async () => {
        const files = (await readdir(dir).catch(() => [] as string[]))
          .filter((f) => f.endsWith(`-${to}.json`) && Number(f.split("-")[0]) >= since)
          .sort();
        found = files.at(-1);
        return !!found;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  const mail = JSON.parse(await readFile(path.join(dir, found!), "utf8")) as { text: string };
  return mail.text.match(/https?:\/\/\S+/)![0];
}

export const CUSTOMER_PASSWORD = "e2e-customer-pass-1";

/** Đăng ký khách mới bằng email (giao diện tiếng Anh) + mở link xác minh → đã đăng nhập, đang ở `next`. */
export async function registerCustomer(page: Page, next = "/en/account") {
  await resetLoginRateLimit();
  const email = `e2e-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@glow.local`;
  const since = Date.now();
  await page.goto(`/en/register?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Full name").fill("Ma E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(CUSTOMER_PASSWORD);
  await page.getByLabel("Confirm password").fill(CUSTOMER_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(`We sent a confirmation link to ${email}`)).toBeVisible();
  await page.goto(await emailLink(email, since));
  // Link xác minh → /login (đã có phiên) → trang `next` (chuyển hướng phía client sau khi trang stream xong).
  await page.waitForURL((u) => u.pathname === next);
  return email;
}

/** Đăng nhập khách bằng email trên /en/login. */
export async function loginCustomer(page: Page, email: string, password = CUSTOMER_PASSWORD, next = "/en/account") {
  await resetLoginRateLimit();
  await page.goto(`/en/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
