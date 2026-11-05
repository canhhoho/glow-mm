import { execSync } from "node:child_process";

/** Áp migration lên DB test (không xoá dữ liệu). */
export default function setup() {
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
  // P24: mỗi fixture tạo 5 kho "IT-*" — sau bộ test, ngừng dùng chúng (DB test dùng chung với E2E)
  // để ô chọn kho / trang Kho hàng / báo cáo của E2E không phình theo số lần chạy.
  return () => {
    execSync("npx prisma db execute --stdin", {
      input: `UPDATE "Location" SET "active" = false WHERE "code" LIKE 'IT-%' AND "active" = true;`,
      stdio: ["pipe", "inherit", "inherit"],
      env: process.env,
    });
  };
}
