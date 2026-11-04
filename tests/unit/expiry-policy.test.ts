import { describe, expect, it } from "vitest";
import { isBatchUsable, pickFefo } from "@/server/inventory/fefo";
import { classifyExpiry } from "@/server/alerts/compute";
import { summarizeStock, type BalanceRow } from "@/server/inventory/stock-summary";

const now = new Date("2026-11-04T10:00:00Z");
describe("Expiry policies", () => {
  it("sells NONE, blocks UNKNOWN and missing DATED, keeps dated FEFO before undated FIFO", () => {
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
  });
  it("stock overview never counts UNKNOWN as sellable or NONE as expiry risk", () => {
    const base: BalanceRow = { variantId: "v", batchId: "b", lotNo: "B", expiryDate: null, landedCostMmk: 100, locationId: "l", locationCode: "MM", locationType: "MM_STOCK", sellable: true, stockType: "SELLABLE", qty: 5 };
    const th = { blockDays: 90, warnDays: 180 };
    const s = summarizeStock([{ ...base, expiryStatus: "NONE" }, { ...base, batchId: "u", expiryStatus: "UNKNOWN" }], now, th);
    expect(s.sellableUnits).toBe(5);
    expect(s.blocked.units).toBe(5);
    expect(classifyExpiry(null, now, th, "NONE")).toBeNull();
    expect(classifyExpiry(null, now, th, "UNKNOWN")).toBe("unknown");
  });
});
