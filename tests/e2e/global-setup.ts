import { execSync } from "node:child_process";

/**
 * Chuẩn bị DB test KHÔNG phá dữ liệu: áp migration + seed (seed tự bỏ qua nếu đã có).
 * CI luôn dùng DB mới; local muốn làm sạch thì tự chạy `npm run db:reset` trên DB test.
 */
export default function globalSetup() {
  const opts = { stdio: "inherit" as const, env: process.env };
  execSync("npx prisma migrate deploy", opts);
  execSync("npx prisma db seed", opts);
  // Xoá bộ đếm chống dò mật khẩu còn lại từ lần chạy trước (chỉ DB test).
  execSync("npx prisma db execute --stdin", { ...opts, stdio: ["pipe", "inherit", "inherit"], input: 'DELETE FROM "rateLimit"; DELETE FROM "customerRateLimit"; DELETE FROM "appRateLimit";' });
}
