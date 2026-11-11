/**
 * FEFO (First Expired, First Out) — chọn lô để xuất. Thuần, không phụ thuộc DB.
 * Quy tắc:
 *  - Lô hết hạn trước xuất trước; cùng hạn → lô nhận trước (receivedAt) trước.
 *  - Bỏ qua lô đã hết hạn hoặc còn hạn < blockDays (khi bán hàng; xuất huỷ thì blockDays = 0).
 *  - Không đủ hàng → InsufficientStockError (không xuất một phần).
 */

export type FefoCandidate = {
  batchId: string;
  expiryDate: Date | null;
  expiryStatus?: "DATED" | "NONE" | "UNKNOWN";
  receivedAt?: Date;
  available: number;
};

export type FefoAllocation = { batchId: string; qty: number };

export class InsufficientStockError extends Error {
  /** Biến thể thiếu hàng (gắn bởi nơi gọi khi biết — vd allocateFefo). */
  variantId?: string;
  constructor(
    public readonly requested: number,
    public readonly available: number,
  ) {
    super(`Không đủ hàng: cần ${requested}, khả dụng ${available}`);
    this.name = "InsufficientStockError";
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Ngày (UTC) mà lô còn bán được tối thiểu phải hết hạn sau. */
export function sellableCutoff(today: Date, blockDays: number): Date {
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return new Date(start + blockDays * DAY_MS);
}

export function isBatchUsable(expiryDate: Date | null, today: Date, blockDays: number, status: "DATED" | "NONE" | "UNKNOWN" = "DATED"): boolean {
  return status === "NONE" || (status === "DATED" && expiryDate != null && expiryDate.getTime() >= sellableCutoff(today, blockDays).getTime());
}

/** Shared by availability and storefront: unknown dates never become sellable. */
export function sellableBatchWhere(today: Date, blockDays: number) {
  return { OR: [{ expiryStatus: "NONE" as const }, { expiryStatus: "DATED" as const, expiryDate: { gte: sellableCutoff(today, blockDays) } }] };
}

/**
 * D9 — lô của cái tiếp theo khách đặt (trang SP: "Hạn dùng của lô bạn sẽ nhận"): cùng thứ tự `pickFefo`
 * (lô có ngày trước, rồi lô không hạn theo ngày nhận), bỏ qua `reserved` cái đầu đã giữ cho đơn khác.
 * Không còn hàng → null. Gần đúng: giữ hàng ở cấp biến thể, lô thật chỉ chốt khi bàn giao.
 */
export function nextLotForCustomer(candidates: FefoCandidate[], reserved: number, opts: { today: Date; blockDays: number }): FefoCandidate | null {
  const qty = Math.max(0, Math.floor(reserved)) + 1;
  let picked: FefoAllocation[];
  try {
    picked = pickFefo(candidates, qty, opts);
  } catch (e) {
    if (e instanceof InsufficientStockError) return null;
    throw e;
  }
  const last = picked[picked.length - 1];
  return candidates.find((c) => c.batchId === last.batchId) ?? null;
}

export function pickFefo(
  candidates: FefoCandidate[],
  qty: number,
  opts: { today: Date; blockDays: number },
): FefoAllocation[] {
  if (!Number.isInteger(qty) || qty <= 0) throw new Error("Số lượng xuất phải là số nguyên dương");

  const usable = candidates
    .filter((c) => c.available > 0 && isBatchUsable(c.expiryDate, opts.today, opts.blockDays, c.expiryStatus))
    .sort(
      (a, b) =>
        (a.expiryDate?.getTime() ?? Infinity) - (b.expiryDate?.getTime() ?? Infinity) ||
        (a.receivedAt?.getTime() ?? 0) - (b.receivedAt?.getTime() ?? 0) ||
        a.batchId.localeCompare(b.batchId),
    );

  const total = usable.reduce((s, c) => s + c.available, 0);
  if (total < qty) throw new InsufficientStockError(qty, total);

  const result: FefoAllocation[] = [];
  let remaining = qty;
  for (const c of usable) {
    if (remaining === 0) break;
    const take = Math.min(c.available, remaining);
    result.push({ batchId: c.batchId, qty: take });
    remaining -= take;
  }
  return result;
}
