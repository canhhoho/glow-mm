import { describe, expect, it, vi } from "vitest";

// Cờ hạn dùng đang TẮT ở production (FEATURES.expiry = false, 17/11/2026). File này bật cờ để giữ kiểm thử quy tắc
// hạn dùng (FEFO, ngưỡng chặn bán, phân loại cận hạn) cho lúc bật lại. Hành vi khi tắt nằm ở các file test gốc.
vi.mock("@/lib/features", async (orig) => (await import("../support/expiry-on")).expiryOn(orig));

import { FEATURES } from "@/lib/features";
import { InsufficientStockError, isBatchUsable, nextLotForCustomer, pickFefo, type FefoCandidate } from "@/server/inventory/fefo";
import { classifyExpiry, daysLeft } from "@/server/alerts/compute";
import { summarizeStock, type BalanceRow } from "@/server/inventory/stock-summary";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("Hạn dùng khi BẬT cờ (FEATURES.expiry = true)", () => {
  it("cờ được bật trong file này", () => {
    expect(FEATURES.expiry).toBe(true);
  });

  describe("FEFO", () => {
    const today = d("2026-10-15");
    const batches = [
      { batchId: "late", expiryDate: d("2028-03-31"), available: 60 },
      { batchId: "early", expiryDate: d("2027-01-15"), available: 20 },
      { batchId: "blocked", expiryDate: d("2026-12-31"), available: 10 }, // còn 77 ngày < 90
      { batchId: "expired", expiryDate: d("2026-10-01"), available: 5 },
    ];
    it("xuất lô hết hạn sớm nhất còn bán được trước, tràn sang lô kế tiếp", () => {
      expect(pickFefo(batches, 15, { today, blockDays: 90 })).toEqual([{ batchId: "early", qty: 15 }]);
      expect(pickFefo(batches, 30, { today, blockDays: 90 })).toEqual([{ batchId: "early", qty: 20 }, { batchId: "late", qty: 10 }]);
    });
    it("bỏ qua lô dưới ngưỡng hạn dùng và lô đã hết hạn", () => {
      expect(() => pickFefo(batches, 81, { today, blockDays: 90 })).toThrow(InsufficientStockError);
    });
    it("blockDays = 0 (xuất huỷ) vẫn dùng lô cận hạn nhưng không dùng lô đã hết hạn", () => {
      expect(pickFefo(batches, 12, { today, blockDays: 0 })).toEqual([{ batchId: "blocked", qty: 10 }, { batchId: "early", qty: 2 }]);
    });
    it("ngưỡng hạn dùng tính theo ngày", () => {
      expect(isBatchUsable(d("2027-01-13"), today, 90)).toBe(true); // đúng 90 ngày
      expect(isBatchUsable(d("2027-01-12"), today, 90)).toBe(false);
    });
  });

  it("phân loại cận hạn / ngừng bán / hết hạn theo số ngày còn lại", () => {
    const now = new Date("2026-10-15T10:00:00Z");
    const T = { blockDays: 90, warnDays: 180 };
    expect(daysLeft(d("2026-10-15"), now)).toBe(0);
    expect(classifyExpiry(d("2026-10-14"), now, T)).toBe("expired");
    expect(classifyExpiry(d("2026-10-15"), now, T)).toBe("blocked");
    expect(classifyExpiry(d("2027-01-12"), now, T)).toBe("blocked"); // còn 89 ngày
    expect(classifyExpiry(d("2027-01-13"), now, T)).toBe("near"); // còn 90 ngày → bán được
    expect(classifyExpiry(d("2027-04-12"), now, T)).toBe("near");
    expect(classifyExpiry(d("2027-04-13"), now, T)).toBe(null);
  });

  it("bán NONE, chặn UNKNOWN và DATED thiếu ngày; lô có ngày (FEFO) trước lô không hạn (FIFO)", () => {
    const now = new Date("2026-11-04T10:00:00Z");
    expect(isBatchUsable(null, now, 90, "NONE")).toBe(true);
    expect(isBatchUsable(null, now, 90, "UNKNOWN")).toBe(false);
    expect(isBatchUsable(null, now, 90)).toBe(false);
    const picks = pickFefo([
      { batchId: "unknown", available: 100, expiryStatus: "UNKNOWN", expiryDate: null },
      { batchId: "none-later", available: 4, expiryStatus: "NONE", expiryDate: null, receivedAt: new Date("2026-01-02") },
      { batchId: "none-first", available: 3, expiryStatus: "NONE", expiryDate: null, receivedAt: new Date("2026-01-01") },
      { batchId: "dated", available: 2, expiryStatus: "DATED", expiryDate: new Date("2028-01-01") },
    ], 6, { today: now, blockDays: 90 });
    expect(picks).toEqual([{ batchId: "dated", qty: 2 }, { batchId: "none-first", qty: 3 }, { batchId: "none-later", qty: 1 }]);
    expect(classifyExpiry(null, now, { blockDays: 90, warnDays: 180 }, "UNKNOWN")).toBe("unknown");
  });

  it("lô khách sẽ nhận bỏ qua lô dưới ngưỡng bán", () => {
    const lot = (batchId: string, available: number, expiry: string): FefoCandidate => ({ batchId, available, expiryDate: new Date(expiry), expiryStatus: "DATED", receivedAt: new Date("2026-01-01") });
    const opts = { today: new Date("2026-11-11T00:00:00Z"), blockDays: 90 };
    expect(nextLotForCustomer([lot("OLD", 9, "2026-12-01"), lot("A", 2, "2027-12-31")], 0, opts)?.batchId).toBe("A");
  });

  it("ô số Tồn kho: cận hạn vẫn bán được, dưới ngưỡng / hết hạn vào ngừng bán, UNKNOWN không bán được", () => {
    const now = new Date("2026-10-19T08:00:00Z");
    const t = { blockDays: 90, warnDays: 180 };
    const inDays = (n: number) => new Date(Date.UTC(2026, 9, 19) + n * 86_400_000);
    let seq = 0;
    const row = (p: Partial<BalanceRow> & Pick<BalanceRow, "locationType" | "qty">): BalanceRow => ({
      variantId: "v1", batchId: `b${++seq}`, lotNo: `L${seq}`, expiryDate: inDays(400), landedCostMmk: 1000,
      locationId: p.locationType, locationCode: p.locationType, sellable: p.locationType === "MM_STOCK", stockType: "SELLABLE", ...p,
    });
    const s = summarizeStock([
      row({ locationType: "MM_STOCK", qty: 10 }),
      row({ locationType: "MM_STOCK", qty: 4, expiryDate: inDays(120) }), // cận hạn
      row({ locationType: "MM_STOCK", qty: 3, expiryDate: inDays(30) }), // ngừng bán
      row({ locationType: "MM_STOCK", qty: 5, expiryDate: inDays(-1) }), // hết hạn
      row({ locationType: "MM_STOCK", qty: 6, expiryDate: null, expiryStatus: "UNKNOWN" }),
    ], now, t);
    expect(s.sellableUnits).toBe(14);
    expect(s.near).toEqual({ units: 4, lots: 1 });
    expect(s.blocked).toEqual({ units: 14, lots: 3 });
  });
});
