import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvObjects, toCsv } from "@/lib/csv";

describe("CSV", () => {
  it("đọc ô có ngoặc kép, dấu phẩy, xuống dòng và BOM", () => {
    const text = '﻿sku,name\r\nA-1,"Kem, chống nắng"\r\nB-2,"Dòng 1\nDòng 2"\r\nC-3,"Nói ""xin chào"""\r\n';
    expect(parseCsv(text)).toEqual([
      ["sku", "name"],
      ["A-1", "Kem, chống nắng"],
      ["B-2", "Dòng 1\nDòng 2"],
      ["C-3", 'Nói "xin chào"'],
    ]);
  });

  it("chữ Myanmar và dòng trống cuối file", () => {
    expect(parseCsvObjects("SKU,Name_MY\nX,နေကာခရင်မ်\n\n")).toEqual([{ sku: "X", name_my: "နေကာခရင်မ်" }]);
  });

  it("báo lỗi khi thiếu ngoặc đóng", () => {
    expect(() => parseCsv('a,"b\n')).toThrow();
  });

  it("ghi rồi đọc lại giữ nguyên dữ liệu", () => {
    const rows = [
      ["a", "b,c"],
      ["d\"e", "f\ng"],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});
