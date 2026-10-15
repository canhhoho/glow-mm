import { randomBytes } from "node:crypto";

/** Mã chứng từ dạng `PREFIX-YYYYMMDD-XXXXXX` (ngày UTC + 6 ký tự hex ngẫu nhiên). */
export function newCode(prefix: string, now = new Date()): string {
  const ymd = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `${prefix}-${ymd}-${randomBytes(3).toString("hex").toUpperCase()}`;
}
