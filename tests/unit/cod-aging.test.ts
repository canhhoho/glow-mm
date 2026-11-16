import { describe, expect, it } from "vitest";
import { codAgeBuckets, codAgeDays, isRegularCod, summarizeCod } from "@/server/orders/cod-aging";

describe("Tuổi nợ COD", () => {
  it("đúng biên 7/14/30 ngày, bỏ dòng chưa thu COD và không tạo tuổi âm", () => {
    const now = new Date("2026-11-05T12:00:00Z");
    const orders = [0, 7, 8, 14, 15, 30, 31].map((days) => ({ totalMmk: 1000, codCollectedAt: new Date(now.getTime() - days * 86400000) }));
    expect(codAgeBuckets([...orders, { totalMmk: 9999, codCollectedAt: null }], now)).toEqual([
      { label: "0-7", orders: 2, mmk: 2000 }, { label: "8-14", orders: 2, mmk: 2000 },
      { label: "15-30", orders: 2, mmk: 2000 }, { label: ">30", orders: 1, mmk: 1000 },
    ]);
    expect(codAgeDays(new Date(now.getTime() + 86400000), now)).toBe(0);
  });
});

describe("Tổng COD chưa về", () => {
  const order = (o: Partial<{ status: string; paymentStatus: string; totalMmk: number; returnedQty: number }> = {}) => ({
    status: o.status ?? "COMPLETED", paymentStatus: o.paymentStatus ?? "PAID", totalMmk: o.totalMmk ?? 1000, items: [{ returnedQty: o.returnedQty ?? 0 }],
  });

  it("tách COD thường và ngoại lệ (có hàng trả, chưa hoàn tất, chưa thu đủ)", () => {
    const orders = [order(), order({ totalMmk: 500 }), order({ returnedQty: 1, totalMmk: 300 }), order({ status: "SHIPPING", totalMmk: 200 }), order({ paymentStatus: "UNPAID", totalMmk: 100 })];
    expect(isRegularCod(orders[0])).toBe(true);
    expect(isRegularCod(orders[2])).toBe(false);
    expect(summarizeCod(orders)).toEqual({
      regular: { count: 2, mmk: 1500 }, exception: { count: 3, mmk: 600 }, total: { count: 5, mmk: 2100 },
    });
  });

  it("danh sách rỗng → toàn số 0", () => {
    expect(summarizeCod([])).toEqual({ regular: { count: 0, mmk: 0 }, exception: { count: 0, mmk: 0 }, total: { count: 0, mmk: 0 } });
  });
});
