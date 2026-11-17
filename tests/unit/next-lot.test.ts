import { describe, expect, it } from "vitest";
import { nextLotForCustomer, type FefoCandidate } from "@/server/inventory/fefo";

// D9 — "Hạn dùng của lô bạn sẽ nhận" trên trang SP.
const today = new Date("2026-11-11T00:00:00Z");
const opts = { today, blockDays: 90 };
const lot = (batchId: string, available: number, expiry: string | null, receivedAt = "2026-01-01"): FefoCandidate => ({
  batchId,
  available,
  expiryDate: expiry ? new Date(expiry) : null,
  expiryStatus: expiry ? "DATED" : "NONE",
  receivedAt: new Date(receivedAt),
});

describe("nextLotForCustomer", () => {
  it("không giữ hàng → lô hết hạn sớm nhất", () => {
    expect(nextLotForCustomer([lot("B", 5, "2028-06-30"), lot("A", 2, "2027-12-31")], 0, opts)?.batchId).toBe("A");
  });
  it("lô sớm nhất đã giữ hết cho đơn khác → lô kế tiếp", () => {
    expect(nextLotForCustomer([lot("A", 2, "2027-12-31"), lot("B", 5, "2028-06-30")], 2, opts)?.batchId).toBe("B");
  });
  it("hết lô có ngày → lô không hạn (sau các lô có ngày)", () => {
    const r = nextLotForCustomer([lot("N", 4, null), lot("A", 1, "2027-12-31")], 1, opts);
    expect(r).toMatchObject({ batchId: "N", expiryStatus: "NONE" });
  });
  it("chỉ có lô không hạn → lô nhận trước", () => {
    expect(nextLotForCustomer([lot("N2", 3, null, "2026-05-01"), lot("N1", 3, null, "2026-02-01")], 0, opts)?.batchId).toBe("N1");
  });
  it("không chặn lô cận hạn khi FEATURES.expiry = false; giữ ≥ tồn → null", () => {
    expect(nextLotForCustomer([lot("OLD", 9, "2026-12-01"), lot("A", 2, "2027-12-31")], 0, opts)?.batchId).toBe("OLD");
    expect(nextLotForCustomer([lot("A", 2, "2027-12-31")], 2, opts)).toBeNull();
  });
});
