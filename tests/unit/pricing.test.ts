import { describe, expect, it } from "vitest";
import { changePct, parseScaled, suggestPrice } from "@/server/pricing/formula";

describe("Công thức giá", () => {
  it("vốn × tỷ giá × (1+%lãi), làm tròn LÊN 100 MMK", () => {
    // 95,000 VND × 0.17 = 16,150 MMK × 1.4 = 22,610 → 22,700
    expect(suggestPrice({ costVnd: 95_000, mmkPerVnd: "0.170000", marginPct: "40", roundTo: 100 })).toBe(22_700);
    // đúng bội số thì giữ nguyên: 100,000 × 0.2 × 1.5 = 30,000
    expect(suggestPrice({ costVnd: 100_000, mmkPerVnd: "0.2", marginPct: "50.00", roundTo: 100 })).toBe(30_000);
  });

  it("không sai số dấu phẩy động", () => {
    // 0.1 + 0.2 kiểu float: 30,000 × 0.000003 × 1.0 = 0.09 → làm tròn lên 1
    expect(suggestPrice({ costVnd: 30_000, mmkPerVnd: "0.000003", marginPct: 0, roundTo: 1 })).toBe(1);
    // 1,000,000 × 0.123456 × 1.0725 = 132,406.56 → 132,500
    expect(suggestPrice({ costVnd: 1_000_000, mmkPerVnd: "0.123456", marginPct: "7.25", roundTo: 100 })).toBe(132_500);
  });

  it("từ chối dữ liệu sai", () => {
    expect(() => suggestPrice({ costVnd: -1, mmkPerVnd: "0.17", marginPct: 10, roundTo: 100 })).toThrow();
    expect(() => suggestPrice({ costVnd: 1, mmkPerVnd: "0", marginPct: 10, roundTo: 100 })).toThrow();
    expect(() => suggestPrice({ costVnd: 1, mmkPerVnd: "0.1234567", marginPct: 10, roundTo: 100 })).toThrow();
    expect(() => parseScaled("-1", 2)).toThrow();
    expect(() => parseScaled("1e5", 2)).toThrow();
  });

  it("% thay đổi", () => {
    expect(changePct(20_000, 22_700)).toBe(13.5);
    expect(changePct(0, 100)).toBeNull();
  });
});
