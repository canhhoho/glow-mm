import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { buildTableWorkbook } from "@/server/reports/xlsx-table";

// 21/11/2026 (audit #15): workbook bảng cho xuất báo cáo bán hàng.
describe("buildTableWorkbook", () => {
  it("mỗi sheet: dòng tiêu đề + dữ liệu; số là ô số, chữ là inline (không thành công thức); tên sheet hợp lệ", () => {
    const files = unzipSync(
      buildTableWorkbook([
        { name: "Tổng hợp", columns: [{ label: "Mục" }, { label: "MMK", numeric: true }], rows: [["Doanh thu", 120000], ["=SUM(A1)", null]] },
        { name: "Theo/ngày?", columns: [{ label: "Ngày" }], rows: [["2026-03-01"]] },
      ]),
    );
    const wb = strFromU8(files["xl/workbook.xml"]);
    expect(wb).toContain('name="Tổng hợp"');
    expect(wb).toContain('name="Theo ngày "');
    const s1 = strFromU8(files["xl/worksheets/sheet1.xml"]);
    expect(s1).toContain('<c r="B2" s="3"><v>120000</v></c>');
    expect(s1).toContain('<c r="A3" s="2" t="inlineStr"><is><t xml:space="preserve">=SUM(A1)</t></is></c>');
    expect(s1).not.toContain("<f>");
    expect(Object.keys(files)).toContain("xl/worksheets/sheet2.xml");
  });
});
