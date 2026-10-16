import { expect, type Page } from "@playwright/test";
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
