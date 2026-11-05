export const FUNNEL_KEYS = ["view", "cart", "checkout", "purchase", "confirmed", "shipped", "completed", "login", "loggedin", "cancelled", "refund"] as const;
export type FunnelKey = typeof FUNNEL_KEYS[number];
export type FunnelCounts = Record<FunnelKey, number>;
export type FunnelRawRow = { device: string | null } & Record<FunnelKey, bigint | number>;

export function summarizeFunnel(rows: FunnelRawRow[]) {
  const empty = (): FunnelCounts => Object.fromEntries(FUNNEL_KEYS.map((k) => [k, 0])) as FunnelCounts;
  const groups = { mobile: empty(), desktop: empty(), unknown: empty() };
  const total = empty();
  for (const row of rows) {
    const group = row.device === "mobile" || row.device === "desktop" ? row.device : "unknown";
    for (const key of FUNNEL_KEYS) { groups[group][key] += Number(row[key]); total[key] += Number(row[key]); }
  }
  return { groups, total, conversionPct: total.view ? Math.round(total.purchase / total.view * 10000) / 100 : null };
}
