export const COD_BUCKETS = [
  { label: "0-7", max: 7 }, { label: "8-14", max: 14 },
  { label: "15-30", max: 30 }, { label: ">30", max: Infinity },
] as const;

export function codAgeDays(collectedAt: Date, now = new Date()) {
  return Math.max(0, Math.floor((now.getTime() - collectedAt.getTime()) / 86_400_000));
}

export function codAgeBuckets(orders: { codCollectedAt: Date | null; totalMmk: number }[], now = new Date()) {
  const buckets = COD_BUCKETS.map((b) => ({ label: b.label, orders: 0, mmk: 0 }));
  for (const o of orders) {
    if (!o.codCollectedAt) continue;
    const index = COD_BUCKETS.findIndex((b) => codAgeDays(o.codCollectedAt!, now) <= b.max);
    buckets[index].orders++;
    buckets[index].mmk += o.totalMmk;
  }
  return buckets;
}
