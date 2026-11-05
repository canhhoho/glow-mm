import { classifyExpiry } from "@/server/alerts/compute";

/**
 * Tổng hợp tồn cho trang Tồn kho (P9). Thuần, không phụ thuộc DB: dữ liệu là các dòng `StockBalance`
 * (qty ≠ 0) kèm thông tin lô + vị trí, do `overview.ts` nạp.
 */

export const LOCATION_TYPES = ["VN_STOCK", "IN_TRANSIT", "CUSTOMS", "MM_STOCK", "QUARANTINE"] as const;
export type LocationTypeKey = (typeof LOCATION_TYPES)[number];
export type StockTypeKey = "SELLABLE" | "TESTER";

export type BalanceRow = {
  variantId: string;
  batchId: string;
  lotNo: string;
  expiryDate: Date | null;
  expiryStatus?: "DATED" | "NONE" | "UNKNOWN";
  /** Giá vốn MMK/đơn vị của lô; null = chưa phân bổ chi phí chuyến. */
  landedCostMmk: number | null;
  locationId: string;
  locationCode: string;
  /** Tên kho (P24: hiển thị theo kho, không theo loại). Thiếu → dùng mã. */
  locationName?: string;
  locationType: LocationTypeKey;
  /** Vị trí bán được (kho MM). */
  sellable: boolean;
  stockType: StockTypeKey;
  qty: number;
};

export type Thresholds = { blockDays: number; warnDays: number };

export type StockSummary = {
  /** SL bán được: SELLABLE tại vị trí bán, lô còn hạn ≥ blockDays (chưa trừ giữ hàng). */
  sellableUnits: number;
  sellableVariants: number;
  /** Σ SL × giá vốn lô (mọi vị trí, mọi loại tồn); lô chưa phân bổ không tính, đếm riêng. */
  valueMmk: number;
  unvaluedUnits: number;
  /** Đang vận chuyển + hải quan. */
  inbound: { units: number; lots: number };
  /** Lô cận hạn (blockDays ≤ còn lại < warnDays) / ngừng bán + hết hạn (< blockDays) — tồn SELLABLE ngoài khu chờ kiểm tra. */
  near: { units: number; lots: number };
  blocked: { units: number; lots: number };
  byLocationType: Record<LocationTypeKey, number>;
  /** SL theo mã kho (tab trang Tồn kho, P24). */
  byLocation: Record<string, number>;
};

const isInbound = (t: LocationTypeKey) => t === "IN_TRANSIT" || t === "CUSTOMS";

export function summarizeStock(rows: BalanceRow[], now: Date, t: Thresholds): StockSummary {
  const byLocationType = Object.fromEntries(LOCATION_TYPES.map((l) => [l, 0])) as Record<LocationTypeKey, number>;
  const sellableVariants = new Set<string>();
  const inboundLots = new Set<string>();
  const nearLots = new Set<string>();
  const blockedLots = new Set<string>();
  const s: StockSummary = {
    sellableUnits: 0,
    sellableVariants: 0,
    valueMmk: 0,
    unvaluedUnits: 0,
    inbound: { units: 0, lots: 0 },
    near: { units: 0, lots: 0 },
    blocked: { units: 0, lots: 0 },
    byLocationType,
    byLocation: {},
  };

  for (const r of rows) {
    if (r.qty <= 0) continue;
    byLocationType[r.locationType] += r.qty;
    s.byLocation[r.locationCode] = (s.byLocation[r.locationCode] ?? 0) + r.qty;
    if (r.landedCostMmk == null) s.unvaluedUnits += r.qty;
    else s.valueMmk += r.qty * r.landedCostMmk;
    if (isInbound(r.locationType)) {
      s.inbound.units += r.qty;
      inboundLots.add(r.batchId);
    }
    if (r.stockType !== "SELLABLE" || r.locationType === "QUARANTINE") continue;
    const level = classifyExpiry(r.expiryDate, now, t, r.expiryStatus);
    if (level === "near") {
      s.near.units += r.qty;
      nearLots.add(r.batchId);
    } else if (level) {
      s.blocked.units += r.qty;
      blockedLots.add(r.batchId);
    }
    if (r.sellable && (level === null || level === "near")) {
      s.sellableUnits += r.qty;
      sellableVariants.add(r.variantId);
    }
  }
  s.sellableVariants = sellableVariants.size;
  s.inbound.lots = inboundLots.size;
  s.near.lots = nearLots.size;
  s.blocked.lots = blockedLots.size;
  return s;
}

export type VariantStockCols = {
  vn: number;
  inbound: number;
  mm: number;
  tester: number;
  quarantine: number;
  /** Tồn SELLABLE (ngoài khu chờ kiểm tra) theo mã kho — cột theo kho ở trang Tồn kho (P24). */
  byLocation: Record<string, number>;
  valueMmk: number;
  /** Có SL thuộc lô chưa phân bổ chi phí (giá trị chưa đủ). */
  unvalued: boolean;
  /** Lô SELLABLE (ngoài khu chờ kiểm tra) hết hạn sớm nhất. */
  earliest: { lotNo: string; expiryDate: Date } | null;
  lots: BalanceRow[];
};

/** Gộp các dòng tồn theo biến thể; dòng lô sắp theo hạn dùng rồi theo loại vị trí. */
export function stockByVariantCols(rows: BalanceRow[]): Map<string, VariantStockCols> {
  const out = new Map<string, VariantStockCols>();
  for (const r of rows) {
    let v = out.get(r.variantId);
    if (!v) {
      v = { vn: 0, inbound: 0, mm: 0, tester: 0, quarantine: 0, byLocation: {}, valueMmk: 0, unvalued: false, earliest: null, lots: [] };
      out.set(r.variantId, v);
    }
    v.lots.push(r);
    if (r.landedCostMmk == null) v.unvalued ||= r.qty > 0;
    else v.valueMmk += r.qty * r.landedCostMmk;
    if (r.locationType === "QUARANTINE") {
      v.quarantine += r.qty;
      continue;
    }
    if (r.stockType === "TESTER") {
      v.tester += r.qty;
      continue;
    }
    if (r.locationType === "VN_STOCK") v.vn += r.qty;
    else if (isInbound(r.locationType)) v.inbound += r.qty;
    else v.mm += r.qty;
    v.byLocation[r.locationCode] = (v.byLocation[r.locationCode] ?? 0) + r.qty;
    if (r.qty > 0 && r.expiryDate && (!v.earliest || r.expiryDate < v.earliest.expiryDate)) {
      v.earliest = { lotNo: r.lotNo, expiryDate: r.expiryDate };
    }
  }
  const order = (t: LocationTypeKey) => LOCATION_TYPES.indexOf(t);
  for (const v of out.values()) {
    v.lots.sort(
      (a, b) =>
        (a.expiryDate?.getTime() ?? Infinity) - (b.expiryDate?.getTime() ?? Infinity) ||
        order(b.locationType) - order(a.locationType) ||
        a.stockType.localeCompare(b.stockType),
    );
  }
  return out;
}
