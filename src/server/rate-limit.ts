import "server-only";
import { prisma } from "@/lib/db";

/**
 * Bộ đếm cửa sổ cố định trong bảng `rateLimit` (dùng chung với Better Auth, khoá riêng). Một câu
 * `INSERT … ON CONFLICT DO UPDATE` nên các request song song không vượt được `max` (P19).
 * Trả `true` nếu còn được phép (lượt này tính là lượt thứ ≤ max trong `windowMs`).
 */
export async function hitRateLimit(key: string, max: number, windowMs: number, now = new Date()): Promise<boolean> {
  const t = BigInt(now.getTime());
  const w = BigInt(windowMs);
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "rateLimit" ("id", "key", "count", "lastRequest") VALUES (${key}, ${key}, 1, ${t})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN ${t} - "rateLimit"."lastRequest" < ${w} THEN "rateLimit"."count" + 1 ELSE 1 END,
      "lastRequest" = CASE WHEN ${t} - "rateLimit"."lastRequest" < ${w} THEN "rateLimit"."lastRequest" ELSE ${t} END
    RETURNING "count"`;
  return rows[0].count <= max;
}
