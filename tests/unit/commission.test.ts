import { describe, expect, it } from "vitest";
import {
  bpToPercent,
  commissionBaseMmk,
  commissionMmk,
  orderCommission,
  payoutLines,
  percentToBp,
  summarizeCommissions,
  type CommissionOrder,
} from "@/server/affiliates/commission";

const NOW = new Date("2026-10-20T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000);
const opts = { now: NOW, holdDays: 7 };

const order = (o: Partial<CommissionOrder> = {}): CommissionOrder => ({
  status: "COMPLETED",
  completedAt: daysAgo(10),
  commissionRateBp: 1000,
  items: [{ qty: 2, returnedQty: 0, unitPriceMmk: 15_000 }],
  paidMmk: 0,
  ...o,
});

describe("Hoa hồng CTV", () => {
  it("căn cứ = tiền hàng trừ phần trả; không âm", () => {
    expect(commissionBaseMmk([{ qty: 3, returnedQty: 1, unitPriceMmk: 10_000 }])).toBe(20_000);
    expect(commissionBaseMmk([{ qty: 1, returnedQty: 2, unitPriceMmk: 10_000 }])).toBe(0);
  });

  it("làm tròn xuống tới MMK; % trống hoặc 0 → 0", () => {
    expect(commissionMmk(12_345, 1250)).toBe(1543); // 1543.125
    expect(commissionMmk(10_000, null)).toBe(0);
    expect(commissionMmk(10_000, 0)).toBe(0);
  });

  it("đơn xong và đã qua hạn giữ → đến hạn trả", () => {
    expect(orderCommission(order(), opts)).toEqual({ baseMmk: 30_000, commissionMmk: 3000, state: "payable", paidMmk: 0, dueMmk: 3000 });
  });

  it("đúng mốc hạn giữ là đến hạn; trước mốc vẫn chờ", () => {
    expect(orderCommission(order({ completedAt: daysAgo(7) }), opts).state).toBe("payable");
    const c = orderCommission(order({ completedAt: daysAgo(6) }), opts);
    expect(c).toMatchObject({ state: "pending", commissionMmk: 3000, dueMmk: 0 });
  });

  it("đơn đang xử lý: hoa hồng dự kiến, chưa đến hạn", () => {
    expect(orderCommission(order({ status: "SHIPPING", completedAt: null }), opts)).toMatchObject({ state: "pending", commissionMmk: 3000, dueMmk: 0 });
  });

  it("đơn huỷ hoặc trả trước khi xong → 0", () => {
    expect(orderCommission(order({ status: "CANCELLED", completedAt: null }), opts)).toMatchObject({ state: "void", commissionMmk: 0, dueMmk: 0 });
    expect(orderCommission(order({ status: "RETURNED", completedAt: null }), opts)).toMatchObject({ state: "void", commissionMmk: 0 });
  });

  it("trả hàng một phần trong hạn giữ → hoa hồng giảm theo", () => {
    const c = orderCommission(order({ completedAt: daysAgo(2), items: [{ qty: 2, returnedQty: 1, unitPriceMmk: 15_000 }] }), opts);
    expect(c).toMatchObject({ state: "pending", commissionMmk: 1500 });
  });

  it("trả hàng sau khi đã chi → số âm, trừ vào kỳ sau", () => {
    const c = orderCommission(order({ status: "RETURNED", items: [{ qty: 2, returnedQty: 2, unitPriceMmk: 15_000 }], paidMmk: 3000 }), opts);
    expect(c).toMatchObject({ state: "payable", commissionMmk: 0, dueMmk: -3000 });
  });

  it("% chốt theo đơn: hai đơn khác % tính riêng", () => {
    expect(orderCommission(order({ commissionRateBp: 1200 }), opts).commissionMmk).toBe(3600);
    expect(orderCommission(order({ commissionRateBp: 800 }), opts).commissionMmk).toBe(2400);
  });

  it("tổng hợp + dòng chi trả: gồm cả số âm, bỏ đơn còn chờ", () => {
    const list = [
      { id: "a", commission: orderCommission(order(), opts) }, // +3000
      { id: "b", commission: orderCommission(order({ completedAt: daysAgo(1) }), opts) }, // chờ 3000
      { id: "c", commission: orderCommission(order({ status: "RETURNED", items: [{ qty: 2, returnedQty: 2, unitPriceMmk: 15_000 }], paidMmk: 1000 }), opts) }, // -1000
      { id: "d", commission: orderCommission(order({ paidMmk: 3000 }), opts) }, // đã trả đủ
    ];
    expect(summarizeCommissions(list.map((l) => l.commission))).toEqual({ pendingMmk: 3000, payableMmk: 2000, paidMmk: 4000 });
    expect(payoutLines(list)).toEqual({
      lines: [
        { orderId: "a", amountMmk: 3000 },
        { orderId: "c", amountMmk: -1000 },
      ],
      totalMmk: 2000,
    });
  });

  it("đổi % ⇄ phần vạn", () => {
    expect(percentToBp(12.5)).toBe(1250);
    expect(bpToPercent(1000)).toBe(10);
  });
});
