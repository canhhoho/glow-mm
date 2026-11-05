import { describe, expect, it } from "vitest";
import { buildPickList, type PickRow } from "@/server/orders/pick-list";

const THAM = { id: "loc-tham", name: "Kho Thắm" };
const CHI = { id: "loc-chi", name: "Kho Chi" };
const lot = (batchId: string, lotNo: string, expiry: string) => ({ batchId, lotNo, expiryDate: new Date(expiry) });
const row = (orderCode: string, variantId: string, qty: number, extra: Partial<PickRow> = {}): PickRow => ({
  orderCode,
  variantId,
  sku: variantId.toUpperCase(),
  name: `SP ${variantId}`,
  location: THAM,
  qty,
  ...extra,
});

describe("buildPickList (DT + D3-lite)", () => {
  it("gộp theo kho → SKU → lô; lô hết hạn trước lên trước, dòng chưa có lô xếp cuối; giữ danh sách đơn", () => {
    const groups = buildPickList([
      row("OD-1", "a", 2, { lot: lot("b2", "L2", "2028-06-01") }),
      row("OD-2", "a", 1, { lot: lot("b1", "L1", "2027-01-01") }),
      row("OD-2", "a", 2, { lot: lot("b2", "L2", "2028-06-01") }),
      row("OD-3", "a", 4), // đơn chưa xác nhận: chưa có lô
      row("OD-2", "c", 3, { location: CHI, lot: lot("b3", "C1", "2029-01-01") }),
    ]);
    expect(groups.map((g) => g.location.name)).toEqual(["Kho Chi", "Kho Thắm"]);
    const tham = groups.find((g) => g.location.id === THAM.id)!;
    expect(tham.totalQty).toBe(9);
    expect(tham.lines).toHaveLength(1);
    expect(tham.lines[0]).toMatchObject({ sku: "A", qty: 9 });
    expect(tham.lines[0].lots.map((l) => [l.lotNo, l.qty, l.orders])).toEqual([
      ["L1", 1, [{ code: "OD-2", qty: 1 }]],
      ["L2", 4, [{ code: "OD-1", qty: 2 }, { code: "OD-2", qty: 2 }]],
      [null, 4, [{ code: "OD-3", qty: 4 }]],
    ]);
    expect(groups.find((g) => g.location.id === CHI.id)!.lines[0].lots[0]).toMatchObject({ lotNo: "C1", qty: 3 });
  });

  it("không có dòng → không có nhóm; số lượng 0 bị bỏ qua", () => {
    expect(buildPickList([])).toEqual([]);
    expect(buildPickList([row("OD", "a", 0)])).toEqual([]);
  });
});
