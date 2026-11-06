import { describe, expect, it } from "vitest";
import {
  bpToPercent,
  commissionBaseMmk,
  commissionMmk,
  effectiveUplineRateBp,
  hasFixedCommission,
  orderCommission,
  payoutLines,
  percentToBp,
  saleCommissionMmk,
  splitCommissions,
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

  it("trả hết hàng sau khi hoàn tất, chưa chi → không tính (không còn 'chờ 0')", () => {
    const c = orderCommission(order({ status: "RETURNED", completedAt: daysAgo(1), items: [{ qty: 2, returnedQty: 2, unitPriceMmk: 15_000 }] }), opts);
    expect(c).toMatchObject({ state: "void", commissionMmk: 0, dueMmk: 0 });
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
    const entry = (orderId: string, c: CommissionOrder) => ({ orderId, kind: "SALE" as const, commission: orderCommission(c, opts) });
    const list = [
      entry("a", order()), // +3000
      entry("b", order({ completedAt: daysAgo(1) })), // chờ 3000
      entry("c", order({ status: "RETURNED", items: [{ qty: 2, returnedQty: 2, unitPriceMmk: 15_000 }], paidMmk: 1000 })), // -1000
      entry("d", order({ paidMmk: 3000 })), // đã trả đủ
    ];
    expect(summarizeCommissions(list.map((l) => l.commission))).toEqual({ pendingMmk: 3000, payableMmk: 2000, paidMmk: 4000 });
    expect(payoutLines(list)).toMatchObject({
      lines: [
        { orderId: "a", kind: "SALE", amountMmk: 3000 },
        { orderId: "c", kind: "SALE", amountMmk: -1000 },
      ],
      totalMmk: 2000,
    });
  });

  it("đổi % ⇄ phần vạn", () => {
    expect(percentToBp(12.5)).toBe(1250);
    expect(bpToPercent(1000)).toBe(10);
  });
});

describe("Hoa hồng hai tầng (P11)", () => {
  const split = (o: Partial<Parameters<typeof splitCommissions>[0]> = {}) =>
    splitCommissions(
      {
        status: "COMPLETED",
        completedAt: daysAgo(10),
        commissionRateBp: 1000,
        uplineRateBp: 200,
        items: [{ qty: 2, returnedQty: 0, unitPriceMmk: 15_000 }],
        lines: [],
        ...o,
      },
      opts,
    );

  it("tầng trên cùng căn cứ + hạn giữ, % riêng; không có tầng trên → null", () => {
    const c = split();
    expect(c.commission).toMatchObject({ commissionMmk: 3000, state: "payable", dueMmk: 3000 });
    expect(c.uplineCommission).toMatchObject({ commissionMmk: 600, state: "payable", dueMmk: 600 });
    expect(split({ uplineRateBp: null }).uplineCommission).toBeNull();
    expect(split({ completedAt: daysAgo(2) }).uplineCommission).toMatchObject({ state: "pending", dueMmk: 0 });
    expect(split({ status: "CANCELLED", completedAt: null }).uplineCommission).toMatchObject({ state: "void", commissionMmk: 0 });
  });

  it("số đã trả tách theo loại dòng", () => {
    const c = split({ lines: [{ kind: "SALE", amountMmk: 3000 }, { kind: "UPLINE", amountMmk: 200 }] });
    expect(c.commission).toMatchObject({ paidMmk: 3000, dueMmk: 0 });
    expect(c.uplineCommission).toMatchObject({ paidMmk: 200, dueMmk: 400 });
  });

  it("trả hàng sau khi đã chi tầng trên → số âm; dòng chi gồm cả hai loại", () => {
    const c = split({ items: [{ qty: 2, returnedQty: 2, unitPriceMmk: 15_000 }], status: "RETURNED", lines: [{ kind: "UPLINE", amountMmk: 600 }] });
    expect(c.uplineCommission).toMatchObject({ commissionMmk: 0, dueMmk: -600 });
    const mixed = payoutLines([
      { orderId: "a", kind: "SALE" as const, commission: split().commission },
      { orderId: "b", kind: "UPLINE" as const, commission: c.uplineCommission! },
    ]);
    expect(mixed.lines).toEqual([
      { orderId: "a", kind: "SALE", amountMmk: 3000 },
      { orderId: "b", kind: "UPLINE", amountMmk: -600 },
    ]);
    expect(mixed.totalMmk).toBe(2400);
  });
});

describe("% tầng trên riêng (P13)", () => {
  it("có % riêng thì dùng, không có thì dùng % chung; 0% riêng vẫn là 0", () => {
    expect(effectiveUplineRateBp({ uplineRateBp: 300 }, 200)).toBe(300);
    expect(effectiveUplineRateBp({ uplineRateBp: null }, 200)).toBe(200);
    expect(effectiveUplineRateBp({ uplineRateBp: 0 }, 200)).toBe(0);
  });
});

describe("Hoa hồng cố định theo sản phẩm (MMK/cái)", () => {
  const items = [
    { qty: 3, returnedQty: 1, unitPriceMmk: 20_000, commissionPerUnitMmk: 2_500 }, // cố định: 2 × 2.500
    { qty: 1, returnedQty: 0, unitPriceMmk: 15_005, commissionPerUnitMmk: null }, // theo %: floor(15.005 × 10%)
    { qty: 2, returnedQty: 0, unitPriceMmk: 9_000, commissionPerUnitMmk: 0 }, // mức 0 = không hoa hồng
  ];

  it("người bán = phần cố định (trừ hàng trả) + % trên tiền hàng các dòng còn lại; đơn cũ ra đúng số cũ", () => {
    expect(saleCommissionMmk(items, 1000)).toBe(5_000 + 1_500);
    expect(saleCommissionMmk(items, null)).toBe(5_000);
    const legacy = [{ qty: 2, returnedQty: 0, unitPriceMmk: 15_000 }];
    expect(saleCommissionMmk(legacy, 1000)).toBe(commissionMmk(commissionBaseMmk(legacy), 1000));
    expect(hasFixedCommission(items)).toBe(true);
    expect(hasFixedCommission(legacy)).toBe(false);
  });

  it("đơn: căn cứ vẫn là toàn bộ tiền hàng; tầng trên giữ % trên toàn bộ tiền hàng", () => {
    const c = splitCommissions({ ...order({ items }), uplineRateBp: 200, lines: [] }, opts);
    expect(c.commission).toMatchObject({ baseMmk: 40_000 + 15_005 + 18_000, commissionMmk: 6_500, state: "payable", dueMmk: 6_500 });
    expect(c.uplineCommission).toMatchObject({ commissionMmk: Math.floor(73_005 * 0.02) });
  });

  it("huỷ → 0; trả hết sau khi chi phần cố định → số âm thu hồi", () => {
    expect(orderCommission(order({ items, status: "CANCELLED", completedAt: null }), opts).commissionMmk).toBe(0);
    const back = orderCommission(order({ status: "RETURNED", items: [{ qty: 2, returnedQty: 2, unitPriceMmk: 20_000, commissionPerUnitMmk: 2_500 }], paidMmk: 5_000 }), opts);
    expect(back).toMatchObject({ commissionMmk: 0, dueMmk: -5_000 });
  });
});
