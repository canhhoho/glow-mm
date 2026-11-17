/**
 * Cảnh báo kho & gợi ý đặt hàng. Thuần, không phụ thuộc DB (dữ liệu lấy ở queries.ts).
 *  - Tồn thấp: khả dụng để bán ≤ `lowStockAt` của biến thể.
 *  - Hạn dùng: hết hạn (< 0 ngày) / ngừng bán (< blockDays) / cận date (< warnDays).
 *  - Gợi ý đặt: nhu cầu = tốc độ bán × (thời gian về VN→MM + số ngày cần đủ hàng) + tồn an toàn;
 *    gợi ý = nhu cầu − khả dụng để bán, không âm. Từ P24 hàng nhập vào THẲNG kho bán của SP (kể cả hàng của chuyến chưa
 *    đánh dấu đã đến) nên đã nằm trong "khả dụng" — không cộng "hàng đang về" nữa (sẽ trùng). Tồn SELLABLE ở vị trí
 *    khác (`otherQty`: kho cũ, kho bán khác) chỉ để xem, không tính vào gợi ý.
 */

import { FEATURES } from "@/lib/features";

const DAY_MS = 86_400_000;

export type ExpiryLevel = "expired" | "blocked" | "near" | "unknown";

/** Số ngày còn lại (theo ngày UTC, hạn dùng lưu kiểu DATE). */
export function daysLeft(expiryDate: Date | null, now: Date): number {
  if (!expiryDate) return 0;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((expiryDate.getTime() - today) / DAY_MS);
}

export function classifyExpiry(
  expiryDate: Date | null,
  now: Date,
  t: { blockDays: number; warnDays: number },
  status: "DATED" | "NONE" | "UNKNOWN" = "DATED",
): ExpiryLevel | null {
  if (!FEATURES.expiry) return null;
  if (status === "NONE") return null;
  if (status === "UNKNOWN" || !expiryDate) return "unknown";
  const left = daysLeft(expiryDate, now);
  if (left < 0) return "expired";
  if (left < t.blockDays) return "blocked";
  if (left < t.warnDays) return "near";
  return null;
}

export type VariantStock = {
  variantId: string;
  sku: string;
  name: string;
  lowStockAt: number;
  safetyStock: number;
  leadTimeDays: number;
  /** Khả dụng để bán (kho bán, lô còn hạn, đã trừ giữ hàng). */
  available: number;
  /**
   * Tồn SELLABLE ở vị trí KHÁC kho bán của SP (kho cũ đã ngừng, kho bán khác; không gồm khu chờ kiểm tra).
   * Chỉ để xem — hàng này chưa bán được cho tới khi chuyển về kho bán, nên KHÔNG tính vào gợi ý đặt.
   */
  otherQty: number;
  /** Số đã bán (đã xuất cho đơn, trừ hàng trả) trong cửa sổ tính tốc độ. */
  soldUnits: number;
};

export type ReorderParams = { salesWindowDays: number; coverDays: number };

export type ReorderSuggestion = VariantStock & {
  dailySales: number;
  /** Số ngày còn bán được với hàng khả dụng hiện có (null nếu không bán). */
  coverDaysLeft: number | null;
  need: number;
  suggestQty: number;
};

export function lowStock(list: VariantStock[]): VariantStock[] {
  return list.filter((v) => v.available <= v.lowStockAt).sort((a, b) => a.available - b.available || a.sku.localeCompare(b.sku));
}

export function reorderSuggestion(v: VariantStock, p: ReorderParams): ReorderSuggestion {
  if (p.salesWindowDays <= 0) throw new Error("Cửa sổ tính tốc độ bán phải > 0");
  const dailySales = Math.max(0, v.soldUnits) / p.salesWindowDays;
  const pipeline = Math.max(0, v.available);
  const need = Math.ceil(dailySales * (v.leadTimeDays + p.coverDays)) + v.safetyStock;
  return {
    ...v,
    dailySales: Math.round(dailySales * 100) / 100,
    coverDaysLeft: dailySales > 0 ? Math.floor(pipeline / dailySales) : null,
    need,
    suggestQty: Math.max(0, need - pipeline),
  };
}

/** Các biến thể cần đặt thêm, ưu tiên sắp hết sớm nhất. */
export function reorderList(list: VariantStock[], p: ReorderParams): ReorderSuggestion[] {
  return list
    .map((v) => reorderSuggestion(v, p))
    .filter((r) => r.suggestQty > 0)
    .sort((a, b) => (a.coverDaysLeft ?? Infinity) - (b.coverDaysLeft ?? Infinity) || b.suggestQty - a.suggestQty);
}
