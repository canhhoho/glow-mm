import "server-only";
import { prisma } from "@/lib/db";

/**
 * Bộ đếm cửa sổ cố định trong bảng riêng `appRateLimit` — KHÔNG dùng chung bảng `rateLimit` của Better Auth:
 * Better Auth xoá mọi dòng cũ hơn cửa sổ dài nhất của nó (60s), làm cửa sổ 10 phút/1 giờ ở đây bị reset sớm.
 * Một câu `INSERT … ON CONFLICT DO UPDATE` nên các request song song không vượt được `max` (P19).
 * Trả `true` nếu còn được phép (lượt này tính là lượt thứ ≤ max trong `windowMs`).
 */
export async function hitRateLimit(key: string, max: number, windowMs: number, now = new Date()): Promise<boolean> {
  const t = BigInt(now.getTime());
  const w = BigInt(windowMs);
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "appRateLimit" ("key", "count", "windowStart") VALUES (${key}, 1, ${t})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN ${t} - "appRateLimit"."windowStart" < ${w} THEN "appRateLimit"."count" + 1 ELSE 1 END,
      "windowStart" = CASE WHEN ${t} - "appRateLimit"."windowStart" < ${w} THEN "appRateLimit"."windowStart" ELSE ${t} END
    RETURNING "count"`;
  return rows[0].count <= max;
}
