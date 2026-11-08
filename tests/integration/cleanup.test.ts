import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupExpired } from "@/server/cron/cleanup";

const tag = randomBytes(4).toString("hex");
const userId = `it-cleanup-${tag}`;

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.rateLimit.deleteMany({ where: { key: { startsWith: `it-cleanup:${tag}` } } });
  await prisma.customerRateLimit.deleteMany({ where: { key: { startsWith: `it-cleanup:${tag}` } } });
  await prisma.appRateLimit.deleteMany({ where: { key: { startsWith: `it-cleanup:${tag}` } } });
  await prisma.verification.deleteMany({ where: { identifier: { startsWith: `it-cleanup:${tag}` } } });
});

describe("Job cleanup (P19)", () => {
  it("xoá bộ đếm rate limit cũ > 1 ngày, phiên + mã xác minh hết hạn; giữ phần còn hiệu lực", async () => {
    const now = new Date();
    const old = BigInt(now.getTime() - 2 * 24 * 3600_000);
    const fresh = BigInt(now.getTime() - 60_000);
    const past = new Date(now.getTime() - 1000);
    const future = new Date(now.getTime() + 3600_000);
    const rl = (k: string, t: bigint) => ({ id: `it-cleanup:${tag}:${k}`, key: `it-cleanup:${tag}:${k}`, count: 1, lastRequest: t });

    await prisma.rateLimit.createMany({ data: [rl("old", old), rl("fresh", fresh)] });
    await prisma.customerRateLimit.createMany({ data: [rl("old", old), rl("fresh", fresh)] });
    await prisma.appRateLimit.createMany({
      data: [
        { key: `it-cleanup:${tag}:old`, count: 1, windowStart: old },
        { key: `it-cleanup:${tag}:fresh`, count: 1, windowStart: fresh },
      ],
    });
    await prisma.user.create({ data: { id: userId, name: "Cleanup", email: `${userId}@glow.local` } });
    await prisma.session.createMany({
      data: [
        { id: `${userId}-a`, token: `${userId}-a`, userId, expiresAt: past },
        { id: `${userId}-b`, token: `${userId}-b`, userId, expiresAt: future },
      ],
    });
    await prisma.verification.createMany({
      data: [
        { id: `${userId}-v1`, identifier: `it-cleanup:${tag}:1`, value: "x", expiresAt: past },
        { id: `${userId}-v2`, identifier: `it-cleanup:${tag}:2`, value: "x", expiresAt: future },
      ],
    });

    const r = await cleanupExpired(now);
    expect(r.rateLimits).toBeGreaterThanOrEqual(1);
    expect(r.customerRateLimits).toBeGreaterThanOrEqual(1);
    expect(r.sessions).toBeGreaterThanOrEqual(1);
    expect(r.verifications).toBeGreaterThanOrEqual(1);

    const keys = (await prisma.rateLimit.findMany({ where: { key: { startsWith: `it-cleanup:${tag}` } } })).map((x) => x.key);
    expect(keys).toEqual([`it-cleanup:${tag}:fresh`]);
    expect(await prisma.customerRateLimit.count({ where: { key: { startsWith: `it-cleanup:${tag}` } } })).toBe(1);
    expect(r.appRateLimits).toBeGreaterThanOrEqual(1);
    expect(await prisma.appRateLimit.count({ where: { key: { startsWith: `it-cleanup:${tag}` } } })).toBe(1);
    expect((await prisma.session.findMany({ where: { userId } })).map((s) => s.id)).toEqual([`${userId}-b`]);
    expect(await prisma.verification.count({ where: { identifier: { startsWith: `it-cleanup:${tag}` } } })).toBe(1);
  });
});
