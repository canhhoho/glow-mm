import "server-only";
import { prisma } from "@/lib/db";
import { analyticsConfig } from "@/lib/env";
import { addDays, yangonDayStart } from "@/lib/time";
import type { Range } from "@/server/reports/queries";
import { summarizeFunnel, type FunnelRawRow } from "./funnel";

/** Phễu tuần tự trong cùng phiên và kỳ; login là nhánh tùy chọn, không bắt mọi khách đăng nhập lại. */
export async function analyticsReport(range: Range) {
  const start = yangonDayStart(range.from);
  const end = yangonDayStart(addDays(range.to, 1));
  const [rows, vitals, first, activeDays] = await Promise.all([
    prisma.$queryRaw<FunnelRawRow[]>`
      WITH viewed AS (
        SELECT "sessionId", MIN("occurredAt") AS at,
          (array_agg(device ORDER BY "occurredAt") FILTER (WHERE device IS NOT NULL))[1] AS device
        FROM "AnalyticsEvent" WHERE name = 'view_item' AND "occurredAt" >= ${start} AND "occurredAt" < ${end}
        GROUP BY "sessionId"
      )
      SELECT v.device, COUNT(*) AS view, COUNT(c.at) AS cart, COUNT(ch.at) AS checkout,
        COUNT(p.at) AS purchase, COUNT(cf.at) AS confirmed, COUNT(sh.at) AS shipped, COUNT(co.at) AS completed,
        COUNT(l.at) AS login, COUNT(ls.at) AS loggedin, COUNT(ca.at) AS cancelled, COUNT(r.at) AS refund
      FROM viewed v
      LEFT JOIN LATERAL (SELECT MIN("occurredAt") AS at FROM "AnalyticsEvent" WHERE "sessionId" = v."sessionId" AND name = 'add_to_cart' AND "occurredAt" >= v.at AND "occurredAt" < ${end}) c ON TRUE
      LEFT JOIN LATERAL (SELECT MIN("occurredAt") AS at FROM "AnalyticsEvent" WHERE "sessionId" = v."sessionId" AND name = 'begin_checkout' AND "occurredAt" >= c.at AND "occurredAt" < ${end}) ch ON TRUE
      LEFT JOIN LATERAL (SELECT MIN("occurredAt") AS at FROM "AnalyticsEvent" WHERE "sessionId" = v."sessionId" AND name = 'purchase' AND props->>'channel' = 'WEB' AND "occurredAt" >= ch.at AND "occurredAt" < ${end}) p ON TRUE
      LEFT JOIN LATERAL (SELECT MIN("occurredAt") AS at FROM "AnalyticsEvent" WHERE "sessionId" = v."sessionId" AND name = 'order_confirmed' AND "occurredAt" >= p.at AND "occurredAt" < ${end}) cf ON TRUE
      LEFT JOIN LATERAL (SELECT MIN("occurredAt") AS at FROM "AnalyticsEvent" WHERE "sessionId" = v."sessionId" AND name = 'order_shipped' AND "occurredAt" >= cf.at AND "occurredAt" < ${end}) sh ON TRUE
      LEFT JOIN LATERAL (SELECT MIN("occurredAt") AS at FROM "AnalyticsEvent" WHERE "sessionId" = v."sessionId" AND name = 'order_completed' AND "occurredAt" >= sh.at AND "occurredAt" < ${end}) co ON TRUE
      LEFT JOIN LATERAL (SELECT MIN("occurredAt") AS at FROM "AnalyticsEvent" WHERE "sessionId" = v."sessionId" AND name = 'login_required' AND "occurredAt" >= v.at AND "occurredAt" < ${end}) l ON TRUE
      LEFT JOIN LATERAL (SELECT MIN("occurredAt") AS at FROM "AnalyticsEvent" WHERE "sessionId" = v."sessionId" AND name = 'login_success' AND "occurredAt" >= l.at AND "occurredAt" < ${end}) ls ON TRUE
      LEFT JOIN LATERAL (SELECT MIN("occurredAt") AS at FROM "AnalyticsEvent" WHERE "sessionId" = v."sessionId" AND name = 'order_cancelled' AND "occurredAt" >= p.at AND "occurredAt" < ${end}) ca ON TRUE
      LEFT JOIN LATERAL (SELECT MIN("occurredAt") AS at FROM "AnalyticsEvent" WHERE "sessionId" = v."sessionId" AND name = 'refund' AND "occurredAt" >= p.at AND "occurredAt" < ${end}) r ON TRUE
      GROUP BY v.device`,
    prisma.$queryRaw<{ device: string | null; metric: string; pageType: string; samples: bigint; p75: number }[]>`
      SELECT device, props->>'metric' AS metric, props->>'pageType' AS "pageType", COUNT(*) AS samples,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY (props->>'value')::double precision) AS p75
      FROM "AnalyticsEvent" WHERE name = 'web_vital' AND "occurredAt" >= ${start} AND "occurredAt" < ${end}
        AND props->>'metric' IN ('LCP', 'INP', 'CLS') AND jsonb_typeof(props->'value') = 'number'
      GROUP BY device, props->>'metric', props->>'pageType'`,
    prisma.analyticsEvent.findFirst({ orderBy: { occurredAt: "asc" }, select: { occurredAt: true } }),
    prisma.$queryRaw<{ days: bigint }[]>`SELECT COUNT(DISTINCT ("occurredAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Yangon')::date) AS days FROM "AnalyticsEvent" WHERE "occurredAt" >= ${start} AND "occurredAt" < ${end}`,
  ]);
  return { ...summarizeFunnel(rows), range, enabled: analyticsConfig().ANALYTICS_ENABLED, startedAt: first?.occurredAt ?? null,
    activeDays: Number(activeDays[0]?.days ?? 0), vitals: vitals.map((v) => ({ ...v, samples: Number(v.samples) })) };
}
