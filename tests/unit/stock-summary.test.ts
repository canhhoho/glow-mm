import { describe, expect, it } from "vitest";
import { stockByVariantCols, summarizeStock, type BalanceRow } from "@/server/inventory/stock-summary";

const now = new Date("2026-10-19T08:00:00Z");
const t = { blockDays: 90, warnDays: 180 };
const inDays = (d: number) => new Date(Date.UTC(2026, 9, 19) + d * 86_400_000);

let seq = 0;
function row(p: Partial<BalanceRow> & Pick<BalanceRow, "locationType" | "qty">): BalanceRow {
  seq++;
  return {
    variantId: "v1",
    batchId: `b${seq}`,
    lotNo: `L${seq}`,
    expiryDate: inDays(400),
    landedCostMmk: 1000,
    locationId: p.locationType,
    locationCode: p.locationType,
    sellable: p.locationType === "MM_STOCK",
    stockType: "SELLABLE",
    ...p,
  };
}

describe("summarizeStock — ô số tổng trang Tồn kho", () => {
  it("bán được = SELLABLE tại vị trí bán, lô còn hạn ≥ blockDays (cận hạn vẫn tính)", () => {
    const s = summarizeStock(
      [
        row({ locationType: "MM_STOCK", qty: 10 }),
        row({ locationType: "MM_STOCK", qty: 4, expiryDate: inDays(120) }), // cận hạn
        row({ locationType: "MM_STOCK", qty: 3, expiryDate: inDays(30) }), // ngừng bán
        row({ locationType: "MM_STOCK", qty: 2, stockType: "TESTER" }),
        row({ locationType: "VN_STOCK", qty: 50, variantId: "v2" }),
        row({ locationType: "QUARANTINE", qty: 1, variantId: "v3" }),
      ],
      now,
      t,
    );
    expect(s.sellableUnits).toBe(14);
    expect(s.sellableVariants).toBe(1);
    expect(s.near).toEqual({ units: 4, lots: 1 });
    expect(s.blocked).toEqual({ units: 3, lots: 1 });
    expect(s.byLocationType).toEqual({ VN_STOCK: 50, IN_TRANSIT: 0, CUSTOMS: 0, MM_STOCK: 19, QUARANTINE: 1 });
  });

  it("hết hạn tính vào ngừng bán; khu chờ kiểm tra và tester không tính cận hạn/ngừng bán", () => {
    const s = summarizeStock(
      [
        row({ locationType: "MM_STOCK", qty: 5, expiryDate: inDays(-1) }),
        row({ locationType: "QUARANTINE", qty: 7, expiryDate: inDays(-1) }),
        row({ locationType: "MM_STOCK", qty: 2, expiryDate: inDays(10), stockType: "TESTER" }),
      ],
      now,
      t,
    );
    expect(s.blocked).toEqual({ units: 5, lots: 1 });
    expect(s.near).toEqual({ units: 0, lots: 0 });
    expect(s.sellableUnits).toBe(0);
  });

  it("đang vận chuyển + hải quan đếm SL và số lô khác nhau", () => {
    const shared = row({ locationType: "IN_TRANSIT", qty: 6 });
    const s = summarizeStock(
      [shared, { ...shared, locationType: "CUSTOMS", locationId: "C", qty: 4 }, row({ locationType: "CUSTOMS", qty: 1 })],
      now,
      t,
    );
    expect(s.inbound).toEqual({ units: 11, lots: 2 });
  });

  it("giá trị tồn = Σ SL × giá vốn lô; lô chưa phân bổ đếm riêng; bỏ dòng SL ≤ 0", () => {
    const s = summarizeStock(
      [
        row({ locationType: "MM_STOCK", qty: 3, landedCostMmk: 2500 }),
        row({ locationType: "VN_STOCK", qty: 4, landedCostMmk: null }),
        row({ locationType: "MM_STOCK", qty: 0, landedCostMmk: 9999 }),
        row({ locationType: "MM_STOCK", qty: -2, landedCostMmk: 9999 }),
      ],
      now,
      t,
    );
    expect(s.valueMmk).toBe(7500);
    expect(s.unvaluedUnits).toBe(4);
  });
});

describe("stockByVariantCols — cột bảng theo sản phẩm", () => {
  it("gộp theo biến thể: VN / đang VC (+ hải quan) / MM / tester / chờ KT, giá trị, lô sớm nhất", () => {
    const cols = stockByVariantCols([
      row({ locationType: "VN_STOCK", qty: 24, lotNo: "DM2810", expiryDate: inDays(700), landedCostMmk: null }),
      row({ locationType: "IN_TRANSIT", qty: 12, lotNo: "DM2810", expiryDate: inDays(700), landedCostMmk: null }),
      row({ locationType: "CUSTOMS", qty: 1, lotNo: "DM2811", expiryDate: inDays(730) }),
      row({ locationType: "MM_STOCK", qty: 6, lotNo: "DM2702", expiryDate: inDays(130) }),
      row({ locationType: "MM_STOCK", qty: 2, lotNo: "DM2809", stockType: "TESTER", expiryDate: inDays(30) }),
      row({ locationType: "QUARANTINE", qty: 1, lotNo: "DM2601", expiryDate: inDays(5) }),
      row({ locationType: "MM_STOCK", qty: 9, variantId: "v2" }),
    ]);
    const v = cols.get("v1")!;
    expect({ vn: v.vn, inbound: v.inbound, mm: v.mm, tester: v.tester, quarantine: v.quarantine }).toEqual({
      vn: 24,
      inbound: 13,
      mm: 6,
      tester: 2,
      quarantine: 1,
    });
    expect(v.valueMmk).toBe((1 + 6 + 2 + 1) * 1000);
    expect(v.unvalued).toBe(true);
    // Tester và hàng chờ kiểm tra không tính "lô hết hạn sớm nhất".
    expect(v.earliest).toEqual({ lotNo: "DM2702", expiryDate: inDays(130) });
    expect(v.lots.map((l) => l.lotNo)).toEqual(["DM2601", "DM2809", "DM2702", "DM2810", "DM2810", "DM2811"]);
    // Cùng lô: vị trí gần khách hơn (MM → đang VC → VN) đứng trước.
    expect(v.lots.slice(3, 5).map((l) => l.locationType)).toEqual(["IN_TRANSIT", "VN_STOCK"]);
    expect(cols.get("v2")!.mm).toBe(9);
  });
});
