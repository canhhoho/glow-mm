import type { OrderStatus } from "@/server/orders/state-machine";

/**
 * Hoa hồng CTV (P10) — hàm thuần, tính lại mỗi lần xem (không lưu sẵn).
 * - Căn cứ = tiền hàng thực thu: Σ (qty − returnedQty) × đơn giá; không tính phí ship.
 * - Hoa hồng người bán = Σ (SL − SL trả) × mức cố định của dòng (chốt lúc gắn CTV, theo biến thể)
 *   + floor(tiền hàng các dòng không có mức cố định × % chốt trên đơn); % tính bằng phần vạn (1000 = 10%).
 * - Hoa hồng tầng trên luôn = floor(toàn bộ căn cứ × % tầng trên), không theo mức cố định của SP.
 * - Trạng thái: `pending` (đơn chưa xong / còn trong hạn giữ), `payable` (đã qua hạn giữ), `void` (huỷ / trả trước khi xong).
 * - Còn phải trả = hoa hồng − đã trả cho đơn đó; có thể âm (khách trả hàng sau khi đã chi) → trừ vào kỳ sau.
 */

export const BP_DENOMINATOR = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CommissionState = "pending" | "payable" | "void";

export type CommissionItem = {
  qty: number;
  returnedQty: number;
  unitPriceMmk: number;
  /** Mức cố định MMK/cái chốt trên dòng đơn; null/undefined = dòng tính theo % của đơn. */
  commissionPerUnitMmk?: number | null;
};

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

/** Hoa hồng người bán: phần cố định theo dòng + phần % trên tiền hàng các dòng còn lại. */
export function saleCommissionMmk(items: CommissionItem[], rateBp: number | null): number {
  const fixed = items.reduce((s, i) => s + (i.commissionPerUnitMmk == null ? 0 : Math.max(0, i.qty - i.returnedQty) * i.commissionPerUnitMmk), 0);
  return fixed + commissionMmk(commissionBaseMmk(items.filter((i) => i.commissionPerUnitMmk == null)), rateBp);
}

/**
 * Mức cố định MMK/cái chốt vào dòng đơn (`OrderItem.commissionPerUnitMmk`) từ hoa hồng hiện tại của biến thể:
 * đơn không có CTV → null (không tính); biến thể không đặt mức → null (dòng theo % đơn). Dùng chung khi tạo đơn
 * (`orders/orders.ts`) và khi gán/đổi/bỏ CTV (`affiliates.ts` `assignOrderAffiliate`) — R4.
 */
/**
 * % bán hàng chốt lên đơn khi gắn CTV. Từ 18/11/2026 hoa hồng bán hàng CHỈ theo mức MMK/cái nhập ở Giá bán
 * (`commissionPerUnitMmk`); SP để trống = không hoa hồng → đơn mới không chốt % (null). Đơn cũ đã chốt % giữ nguyên
 * (`saleCommissionMmk` vẫn tính % khi đơn có `commissionRateBp`). Hoa hồng tầng trên không đổi (% trên tiền hàng).
 * Dùng chung khi tạo đơn và khi gán/đổi CTV.
 */
export function saleRateSnapshotBp(): number | null {
  return null;
}

export function commissionPerUnitSnapshot(variantCommissionMmk: number | null | undefined, hasAffiliate: boolean): number | null {
  return hasAffiliate ? (variantCommissionMmk ?? null) : null;
}

/** Đơn có dòng tính hoa hồng cố định theo sản phẩm (để giao diện ghi chú cạnh % của đơn). */
export function hasFixedCommission(items: CommissionItem[]): boolean {
  return items.some((i) => i.commissionPerUnitMmk != null);
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
  let state = commissionState(o, opts);
  // Trả hết hàng sau khi hoàn tất và chưa chi trả gì → không còn gì để tính hay thu hồi: "Không tính" thay vì "Chờ 0".
  // Đã chi trả thì giữ trạng thái theo hạn để phần âm (thu hồi) vẫn vào kỳ chi trả.
  if (o.status === "RETURNED" && o.paidMmk === 0 && commissionBaseMmk(o.items) === 0) state = "void";
  const baseMmk = state === "void" ? 0 : commissionBaseMmk(o.items);
  const amount = state === "void" ? 0 : saleCommissionMmk(o.items, o.commissionRateBp);
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

// ── Hai tầng (P11): hoa hồng bán hàng (SALE) của người bán + hoa hồng tầng trên (UPLINE) của cấp trên ──

export type CommissionLineKind = "SALE" | "UPLINE";

export type SplitCommissionOrder = Omit<CommissionOrder, "paidMmk"> & {
  uplineRateBp: number | null;
  /** Mọi dòng chi trả đã ghi cho đơn (cả hai loại). */
  lines: { kind: CommissionLineKind; amountMmk: number }[];
};

/** Tách hoa hồng của một đơn: phần người bán và phần cấp trên (null nếu đơn không có tầng trên). */
export function splitCommissions(o: SplitCommissionOrder, opts: { now: Date; holdDays: number }) {
  const paid = (kind: CommissionLineKind) => o.lines.filter((l) => l.kind === kind).reduce((s, l) => s + l.amountMmk, 0);
  const uplinePaid = paid("UPLINE");
  return {
    commission: orderCommission({ ...o, paidMmk: paid("SALE") }, opts),
    uplineCommission:
      o.uplineRateBp == null && uplinePaid === 0
        ? null
        : // Tầng trên: % trên toàn bộ tiền hàng — bỏ mức cố định của dòng.
          orderCommission({ ...o, items: o.items.map((i) => ({ ...i, commissionPerUnitMmk: null })), commissionRateBp: o.uplineRateBp, paidMmk: uplinePaid }, opts),
  };
}

export type PayoutEntry = { orderId: string; kind: CommissionLineKind; commission: OrderCommission };

/** Dòng chi trả cho một lần chốt: mọi phần đến hạn có số còn phải trả ≠ 0 (kể cả số âm), cả hai loại. */
export function payoutLines<T extends PayoutEntry>(entries: T[]) {
  const due = entries.filter((e) => e.commission.state !== "pending" && e.commission.dueMmk !== 0);
  return {
    entries: due,
    lines: due.map((e) => ({ orderId: e.orderId, kind: e.kind, amountMmk: e.commission.dueMmk })),
    totalMmk: due.reduce((s, e) => s + e.commission.dueMmk, 0),
  };
}

/** % tầng trên áp dụng cho một cấp trên (P13): % riêng của người đó, không có thì % chung trong Cài đặt. */
export function effectiveUplineRateBp(affiliate: { uplineRateBp: number | null }, globalBp: number): number {
  return affiliate.uplineRateBp ?? globalBp;
}

/** "10" / "12.5" (%) ⇄ phần vạn. */
export function percentToBp(percent: number): number {
  return Math.round(percent * 100);
}
export function bpToPercent(bp: number): number {
  return bp / 100;
}
