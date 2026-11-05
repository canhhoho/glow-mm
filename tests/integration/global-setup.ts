import { execSync } from "node:child_process";

/** Áp migration lên DB test (không xoá dữ liệu). */
export default function setup() {
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
  // P24: mỗi fixture tạo 5 kho "IT-*" — sau bộ test, ngừng dùng chúng (DB test dùng chung với E2E)
  // để ô chọn kho / trang Kho hàng / báo cáo của E2E không phình theo số lần chạy.
  return () => {
    execSync("npx prisma db execute --stdin", {
      // Một số test đổi slug SP (copy/readiness) nên không thể dọn chỉ theo slug it-*.
      // Kho IT-* do makeFixture tạo riêng: gỡ đăng mọi SP thuộc các kho này để không phình menu storefront E2E.
      input: `UPDATE "Product" p SET "published" = false FROM "Location" l WHERE p."stockLocationId" = l.id AND l.code LIKE 'IT-%' AND p.published = true;
UPDATE "Location" SET "active" = false WHERE "code" LIKE 'IT-%' AND "active" = true;`,
      stdio: ["pipe", "inherit", "inherit"],
      env: process.env,
    });
  };
}
