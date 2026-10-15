import { execSync } from "node:child_process";

/** Áp migration lên DB test (không xoá dữ liệu). */
export default function setup() {
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
}
