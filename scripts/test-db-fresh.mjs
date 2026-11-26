#!/usr/bin/env node
/**
 * Làm sạch DB test trên máy: xoá + tạo lại `glow_test` rồi migrate + seed (25/11/2026).
 * Lý do: mỗi lần chạy integration/E2E thêm dữ liệu mẫu vào glow_test (thiết kế không xoá) → sau vài tuần trang admin chậm,
 * E2E timeout. CI không bị vì luôn dùng DB mới.
 *
 *   npm run db:test:fresh      — chỉ làm sạch
 *   npm run test:e2e:fresh     — làm sạch rồi chạy Playwright (tham số thêm: npm run test:e2e:fresh -- <spec> --project=mobile)
 *
 * An toàn: chỉ chạy khi DATABASE_URL trong .env.test là localhost/127.0.0.1:15432 với tên DB đúng `glow_test`. Xoá/tạo DB qua
 * kết nối thẳng (gói `pg`, DB bảo trì `postgres`) nên chạy được cả Postgres trong Docker lẫn Postgres cài thẳng trên Windows
 * (máy không có Docker, 26/11/2026). Không dùng `prisma migrate reset`. Không in mật khẩu/URL.
 * Lưu ý: phiên làm việc khác đang dùng glow_test (test đang chạy) sẽ bị ngắt kết nối.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import pg from "pg";

const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1"]);
const DB = "glow_test";

const fileEnv = parse(readFileSync(".env.test"));
const url = new URL(fileEnv.DATABASE_URL ?? "");
const name = url.pathname.replace(/^\//, "");
if (!ALLOWED_HOSTS.has(url.hostname) || url.port !== "15432" || name !== DB) {
  console.error(`⛔ Từ chối: .env.test phải trỏ localhost:15432/${DB} (đang là ${url.hostname}:${url.port}/${name}).`);
  process.exit(1);
}
const user = decodeURIComponent(url.username || "glow");

const run = (cmd, args, env) => execFileSync(cmd, args, { stdio: "inherit", env, shell: process.platform === "win32" });
const quoteIdent = (s) => `"${s.replaceAll('"', '""')}"`;

console.log(`• Xoá và tạo lại ${DB}…`);
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const client = new pg.Client({ connectionString: adminUrl.toString() });
try {
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await client.query(`CREATE DATABASE ${DB} OWNER ${quoteIdent(user)}`);
} catch (err) {
  console.error(`⛔ Không xoá/tạo được ${DB}: ${err.message}. Postgres có đang chạy ở localhost:15432 không?`);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}

// Giống vitest.integration.config / playwright.config: .env.test đè .env, DIRECT_DATABASE_URL rỗng để CLI không trỏ nhầm DB dev.
const env = { ...process.env, ...fileEnv, DIRECT_DATABASE_URL: "" };
delete env.E2E_DATABASE_URL;
console.log("• Migrate + seed…");
run("npx", ["prisma", "migrate", "deploy"], env);
run("npx", ["prisma", "db", "seed"], env);
console.log(`✓ ${DB} sạch: chỉ còn dữ liệu seed.`);
