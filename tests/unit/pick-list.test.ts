import { describe, expect, it } from "vitest";
import { buildPickList, type PickOrder } from "@/server/orders/pick-list";

const THAM = { id: "loc-tham", name: "Kho Thắm" };
const CHI = { id: "loc-chi", name: "Kho Chi" };

describe("buildPickList (DT)", () => {
  it("gộp theo kho + SKU, combo bung thành phần, giữ danh sách đơn", () => {
    const orders: PickOrder[] = [
      { id: "o1", code: "OD-1", items: [{ variantId: "a", sku: "A", name: "Kem A", qty: 2, location: THAM }] },
      {
        id: "o2",
        code: "OD-2",
        items: [
          { variantId: "a", sku: "A", name: "Kem A", qty: 1, location: THAM },
          {
            variantId: "set",
            sku: "SET",
            name: "Combo",
            qty: 2,
            location: THAM,
            components: [
              { variantId: "a", sku: "A", name: "Kem A", qty: 1 },
              { variantId: "b", sku: "B", name: "Sữa rửa mặt B", qty: 2 },
            ],
          },
          { variantId: "c", sku: "C", name: "Son C", qty: 3, location: CHI },
        ],
      },
    ];
    const groups = buildPickList(orders);
    expect(groups.map((g) => g.location.name)).toEqual(["Kho Chi", "Kho Thắm"]);
    const tham = groups.find((g) => g.location.id === THAM.id)!;
    expect(tham.lines).toEqual([
      { variantId: "a", sku: "A", name: "Kem A", qty: 5, orders: [{ code: "OD-1", qty: 2 }, { code: "OD-2", qty: 3 }] },
      { variantId: "b", sku: "B", name: "Sữa rửa mặt B", qty: 4, orders: [{ code: "OD-2", qty: 4 }] },
    ]);
    expect(tham.totalQty).toBe(9);
    expect(groups.find((g) => g.location.id === CHI.id)!.lines).toEqual([
      { variantId: "c", sku: "C", name: "Son C", qty: 3, orders: [{ code: "OD-2", qty: 3 }] },
    ]);
  });

  it("không có đơn → không có nhóm; số lượng 0 bị bỏ qua", () => {
    expect(buildPickList([])).toEqual([]);
    expect(buildPickList([{ id: "o", code: "OD", items: [{ variantId: "a", sku: "A", name: "A", qty: 0, location: THAM }] }])).toEqual([]);
  });
});
