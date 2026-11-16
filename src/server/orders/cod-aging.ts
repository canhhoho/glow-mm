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

type CodOrder = { status: string; paymentStatus: string; totalMmk: number; items: { returnedQty: number }[] };

/** COD "thường" = đơn hoàn tất, đã thu đủ, không có hàng trả; còn lại là ngoại lệ cần xử lý riêng ở trang Đối soát COD. */
export function isRegularCod(o: Pick<CodOrder, "status" | "paymentStatus" | "items">) {
  return o.status === "COMPLETED" && o.paymentStatus === "PAID" && !o.items.some((i) => i.returnedQty > 0);
}

/** Số đơn + số tiền COD đã thu từ khách nhưng chưa đối soát tiền về — dùng chung cho trang COD và Tổng quan. */
export function summarizeCod(orders: CodOrder[]) {
  const sum = (list: CodOrder[]) => ({ count: list.length, mmk: list.reduce((s, o) => s + o.totalMmk, 0) });
  const regular = orders.filter(isRegularCod);
  return { regular: sum(regular), exception: sum(orders.filter((o) => !isRegularCod(o))), total: sum(orders) };
}
