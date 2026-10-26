import type { OrderStatus } from "@/server/orders/state-machine";

/**
 * Hoa hồng CTV (P10) — hàm thuần, tính lại mỗi lần xem (không lưu sẵn).
 * - Căn cứ = tiền hàng thực thu: Σ (qty − returnedQty) × đơn giá; không tính phí ship.
 * - Hoa hồng = floor(căn cứ × % chốt trên đơn), % tính bằng phần vạn (1000 = 10%).
 * - Trạng thái: `pending` (đơn chưa xong / còn trong hạn giữ), `payable` (đã qua hạn giữ), `void` (huỷ / trả trước khi xong).
 * - Còn phải trả = hoa hồng − đã trả cho đơn đó; có thể âm (khách trả hàng sau khi đã chi) → trừ vào kỳ sau.
 */

export const BP_DENOMINATOR = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CommissionState = "pending" | "payable" | "void";

export type CommissionItem = { qty: number; returnedQty: number; unitPriceMmk: number };

export type CommissionOrder = {
  status: OrderStatus;
  completedAt: Date | null;
  commissionRateBp: number | null;
  items: CommissionItem[];
  /** Tổng các dòng chi trả đã ghi cho đơn này. */
  paidMmk: number;
};

export type OrderCommission = {
  baseMmk: number;
  commissionMmk: number;
  state: CommissionState;
  paidMmk: number;
  /** Phần đến hạn chưa trả (0 nếu còn `pending`). */
  dueMmk: number;
};

export function commissionBaseMmk(items: CommissionItem[]): number {
  return items.reduce((s, i) => s + Math.max(0, i.qty - i.returnedQty) * i.unitPriceMmk, 0);
}

export function commissionMmk(baseMmk: number, rateBp: number | null): number {
  if (!rateBp || rateBp <= 0 || baseMmk <= 0) return 0;
  return Math.floor((baseMmk * rateBp) / BP_DENOMINATOR);
}

export function commissionState(
  o: Pick<CommissionOrder, "status" | "completedAt">,
  opts: { now: Date; holdDays: number },
): CommissionState {
  if (o.status === "CANCELLED") return "void";
  if (!o.completedAt) return o.status === "RETURNED" ? "void" : "pending";
  return o.completedAt.getTime() + opts.holdDays * DAY_MS <= opts.now.getTime() ? "payable" : "pending";
}

export function orderCommission(o: CommissionOrder, opts: { now: Date; holdDays: number }): OrderCommission {
  const state = commissionState(o, opts);
  const baseMmk = state === "void" ? 0 : commissionBaseMmk(o.items);
  const amount = commissionMmk(baseMmk, o.commissionRateBp);
  const dueMmk = state === "pending" ? 0 : amount - o.paidMmk;
  return { baseMmk, commissionMmk: amount, state, paidMmk: o.paidMmk, dueMmk };
}

export type CommissionSummary = {
  /** Hoa hồng dự kiến của đơn chưa đến hạn. */
  pendingMmk: number;
  /** Đến hạn chưa trả (đã trừ phần âm do trả hàng sau khi chi). */
  payableMmk: number;
  /** Đã nhận. */
  paidMmk: number;
};

export function summarizeCommissions(list: OrderCommission[]): CommissionSummary {
  return list.reduce(
    (s, c) => ({
      pendingMmk: s.pendingMmk + (c.state === "pending" ? c.commissionMmk : 0),
      payableMmk: s.payableMmk + c.dueMmk,
      paidMmk: s.paidMmk + c.paidMmk,
    }),
    { pendingMmk: 0, payableMmk: 0, paidMmk: 0 },
  );
}

/** Dòng chi trả cho một lần chốt: mọi đơn đến hạn có số còn phải trả ≠ 0 (kể cả số âm). */
export function payoutLines<T extends { id: string; commission: OrderCommission }>(orders: T[]) {
  const lines = orders.filter((o) => o.commission.state !== "pending" && o.commission.dueMmk !== 0);
  return { lines: lines.map((o) => ({ orderId: o.id, amountMmk: o.commission.dueMmk })), totalMmk: lines.reduce((s, o) => s + o.commission.dueMmk, 0) };
}

/** "10" / "12.5" (%) ⇄ phần vạn. */
export function percentToBp(percent: number): number {
  return Math.round(percent * 100);
}
export function bpToPercent(bp: number): number {
  return bp / 100;
}
