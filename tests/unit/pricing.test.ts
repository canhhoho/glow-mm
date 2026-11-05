import { describe, expect, it } from "vitest";
import {
  changePct,
  convertVndToMmk,
  mmkPerVndFromUsd,
  parseScaled,
  priceLocalMmk,
  priceVnImport,
  rateDisplay,
  shippingMmk,
  suggestPrice,
} from "@/server/pricing/formula";

describe("Giá theo kho (P24)", () => {
  const rate = { mmkPerVnd: "0.17", mmkPerUsd: "4420", vndPerUsd: "26000" }; // 1 VND = 0.17 MMK

  it("Kho Thắm: vốn VND × tỷ giá × (1 + %) + ship/kg × khối lượng, % chỉ trên hàng, làm tròn lên một lần", () => {
    // 100,000 VND × 0.17 = 17,000 MMK × 1.3 = 22,100; ship 8,000 MMK/kg × 80 g = 640 → 22,740 → 22,800
    expect(priceVnImport({ ...rate, costVnd: 100_000, marginPct: "30", shipMmkPerKg: 8_000, weightGrams: 80, roundTo: 100 })).toBe(22_800);
    // không làm tròn: 22,740 đúng
    expect(priceVnImport({ ...rate, costVnd: 100_000, marginPct: "30", shipMmkPerKg: 8_000, weightGrams: 80, roundTo: 1 })).toBe(22_740);
    // ship 0 → trùng công thức cũ
    expect(priceVnImport({ ...rate, costVnd: 95_000, marginPct: "40", shipMmkPerKg: 0, weightGrams: 80, roundTo: 100 })).toBe(
      suggestPrice({ ...rate, costVnd: 95_000, marginPct: "40", roundTo: 100 }),
    );
    // phần lẻ của ship không bị làm tròn riêng: 1 MMK/kg × 1 g = 0.001 → vẫn làm tròn LÊN tổng
    expect(priceVnImport({ ...rate, costVnd: 0, marginPct: "0", shipMmkPerKg: 1, weightGrams: 1, roundTo: 1 })).toBe(1);
    expect(shippingMmk(8_000, 80)).toBe(640);
    expect(shippingMmk(5_000, 125)).toBe(625);
    expect(() => priceVnImport({ ...rate, costVnd: 1, marginPct: "1", shipMmkPerKg: -1, weightGrams: 1, roundTo: 1 })).toThrow();
  });

  it("Kho Chi: vốn MMK + lãi cố định, làm tròn lên", () => {
    expect(priceLocalMmk({ costMmk: 18_250, fixedProfitMmk: 5_000, roundTo: 100 })).toBe(23_300);
    expect(priceLocalMmk({ costMmk: 18_250, fixedProfitMmk: 5_000, roundTo: 1 })).toBe(23_250);
    expect(() => priceLocalMmk({ costMmk: 1.5, fixedProfitMmk: 0, roundTo: 1 })).toThrow();
  });
});

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

  it("tỷ giá nhập qua USD: tính theo tỷ lệ chính xác", () => {
    const usd = { mmkPerVnd: "0.173077", mmkPerUsd: "4500", vndPerUsd: "26000" };
    // 100,000,000 × 4500/26000 = 17,307,692.3 → 17,307,693 (qua số làm tròn 0.173077 sẽ ra 17,307,700).
    expect(suggestPrice({ ...usd, costVnd: 100_000_000, marginPct: 0, roundTo: 1 })).toBe(17_307_693);
    // 95,000 × 4500/26000 × 1.4 = 23,019.2 → 23,100
    expect(suggestPrice({ ...usd, costVnd: 95_000, marginPct: "40", roundTo: 100 })).toBe(23_100);
    // tỷ giá cũ (USD null) vẫn dùng mmkPerVnd như trước
    const old = { mmkPerVnd: "0.170000", mmkPerUsd: null, vndPerUsd: null };
    expect(suggestPrice({ ...old, costVnd: 95_000, marginPct: "40", roundTo: 100 })).toBe(22_700);
    expect(convertVndToMmk(120_000, usd)).toBe(20_769); // 20,769.23
    expect(() => suggestPrice({ ...usd, mmkPerUsd: "0", costVnd: 1, marginPct: 0, roundTo: 1 })).toThrow();
  });

  it("tỷ giá hai chiều", () => {
    expect(mmkPerVndFromUsd("4500", "26000")).toBe("0.173077");
    expect(mmkPerVndFromUsd("4420", "26000")).toBe("0.170000");
    expect(rateDisplay({ mmkPerVnd: "0", mmkPerUsd: "4500", vndPerUsd: "26000" })).toEqual({
      vndPerMmk: "5.7778",
      mmkPerVnd: "0.173077",
    });
    expect(rateDisplay({ mmkPerVnd: "0.170000" })).toEqual({ vndPerMmk: "5.8824", mmkPerVnd: "0.170000" });
  });

  it("% thay đổi", () => {
    expect(changePct(20_000, 22_700)).toBe(13.5);
    expect(changePct(0, 100)).toBeNull();
  });
});
