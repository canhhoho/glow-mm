import { describe, expect, it } from "vitest";
import { codAgeBuckets, codAgeDays } from "@/server/orders/cod-aging";

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
