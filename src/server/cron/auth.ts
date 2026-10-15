import { timingSafeEqual } from "node:crypto";

/**
 * Xác thực cron: header `Authorization: Bearer <CRON_SECRET>`.
 * Vercel Cron tự gửi header này; Coolify/crontab gửi bằng curl.
 */
export function isAuthorizedCron(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || !authorization?.startsWith("Bearer ")) return false;
  const a = Buffer.from(authorization.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
