import { describe, expect, it } from "vitest";
import { parseDateLoose, parseIntLoose, parseReceivePaste } from "@/lib/receive-paste";

const SKUS = ["KC-001", "KC-002", "KC-015-1WW1"];

describe("parseReceivePaste", () => {
  it("đọc dữ liệu copy từ Excel (tab), bỏ dòng tiêu đề và dòng trống", () => {
    const text = "SKU\tSL\tLô\tHSD\tGiá\nkc-001\t10\tL01\t31/12/2028\t90,000\n\nKC-002\t5\tL02\t2028-06-30\t120.000\t\tTESTER\r\n";
    const r = parseReceivePaste(text, SKUS);
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { sku: "KC-001", qty: 10, lotNo: "L01", expiryDate: "2028-12-31", unitCostVnd: 90000, mfgDate: "", stockType: null },
      { sku: "KC-002", qty: 5, lotNo: "L02", expiryDate: "2028-06-30", unitCostVnd: 120000, mfgDate: "", stockType: "TESTER" },
    ]);
  });

  it("cột tuỳ chọn Ngày SX + Loại tồn; dấu phẩy / chấm phẩy làm phân cách", () => {
    const r = parseReceivePaste("KC-015-1WW1;3;A1;;50000;01/01/2026;tester\nKC-001,2,B2,2029-01-01,", SKUS);
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ sku: "KC-015-1WW1", expiryDate: "", mfgDate: "2026-01-01", stockType: "TESTER" });
    expect(r.rows[1]).toMatchObject({ sku: "KC-001", qty: 2, unitCostVnd: null });
  });

  it("báo lỗi theo số dòng: SKU lạ, SL sai, ngày sai, loại tồn sai", () => {
    const r = parseReceivePaste("KC-001\t1\tA\t2028-01-01\t1\nXX-9\t1\nKC-001\t0\nKC-001\t1\tA\t31/02/2028\nKC-001\t1\tA\t\t1\t\tFOO", SKUS);
    expect(r.rows).toHaveLength(1);
    expect(r.errors.map((e) => [e.line, e.code])).toEqual([
      [2, "sku"],
      [3, "qty"],
      [4, "date"],
      [5, "stockType"],
    ]);
  });
});

describe("parse loose", () => {
  it("số và ngày", () => {
    expect(parseIntLoose("1 234 567")).toBe(1234567);
    expect(parseIntLoose("12a")).toBeNull();
    expect(parseDateLoose("5-7-2027")).toBe("2027-07-05");
    expect(parseDateLoose("2027/7/5")).toBe("2027-07-05");
    expect(parseDateLoose("2027-13-01")).toBeNull();
    expect(parseDateLoose("")).toBe("");
  });
});
