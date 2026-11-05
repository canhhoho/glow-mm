import "server-only";
import { prisma } from "@/lib/db";
import { analyticsConfig } from "@/lib/env";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Dọn dữ liệu tạm hằng ngày (P19): bộ đếm rate limit cũ (Better Auth + tự viết — cửa sổ dài nhất 1 giờ, xoá sau 1 ngày),
 * phiên đăng nhập và mã xác minh đã hết hạn. Không đụng dữ liệu nghiệp vụ.
 */
export async function cleanupExpired(now = new Date()) {
  const staleBefore = BigInt(now.getTime() - DAY_MS);
  const [rateLimits, customerRateLimits, sessions, verifications, analytics] = await Promise.all([
    prisma.rateLimit.deleteMany({ where: { lastRequest: { lt: staleBefore } } }),
    prisma.customerRateLimit.deleteMany({ where: { lastRequest: { lt: staleBefore } } }),
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.verification.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.analyticsEvent.deleteMany({ where: { occurredAt: { lt: new Date(now.getTime() - analyticsConfig().ANALYTICS_RETENTION_DAYS * DAY_MS) } } }),
  ]);
  return {
    rateLimits: rateLimits.count,
    customerRateLimits: customerRateLimits.count,
    sessions: sessions.count,
    verifications: verifications.count,
    analytics: analytics.count,
  };
}
