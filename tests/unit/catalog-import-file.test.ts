import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { readSheet, type CellValue } from "read-excel-file/node";
import definitions from "@/lib/catalog-import-columns.json";
import { parseCsvObjects } from "@/lib/csv";
import { importSheetToCsv, readImportFile } from "@/server/catalog/import-file";

const asset = (kind: string) => readFile(`public/templates/${kind}.xlsx`);

describe("Mẫu Excel và bộ đọc import", () => {
  it.each(["products", "stock"] as const)("%s: mẫu tải xuống đọc được, không chứa dữ liệu ví dụ trong vùng nhập", async (kind) => {
    const file = new File([new Uint8Array(await asset(kind))], `${kind}.xlsx`);
    await expect(readImportFile(file, kind)).rejects.toThrow("File chưa có dữ liệu");
    const guide = await readSheet(await asset(kind), "Huong dan");
    expect(guide.some((r) => r.includes("Ví dụ tham khảo"))).toBe(true);
  });

  it("đọc tiêu đề hai dòng, giữ SKU có số 0 đầu và số dòng sau khoảng trống", async () => {
    const rows = await readSheet(await asset("products"), "San pham");
    const example = Object.fromEntries(definitions.products.map((c) => [c.key, c.example]));
    example.sku = "000123";
    rows[6] = definitions.products.map((c) => example[c.key]);
    rows[7] = [];
    rows[8] = definitions.products.map((c) => c.key === "sku" ? "000124" : example[c.key]);
    const result = importSheetToCsv(rows, "products");
    expect(result.lineNumbers).toEqual([7, 9]);
    expect(parseCsvObjects(result.csv)).toMatchObject([
      { sku: "000123", name_my: "နေကာခရင်မ် SPF50", price_mmk: "25000" },
      { sku: "000124", product_slug: "kem-chong-nang-spf50" },
    ]);
  });

  it("đọc ngày Excel và ngày dd/mm/yyyy thành ISO cho nghiệp vụ kho", async () => {
    const rows = await readSheet(await asset("stock"), "Ton dau ky");
    const guide = await readSheet(await asset("stock"), "Huong dan");
    const excelDate = guide.find((r) => r[1] === "expiry_date")![4];
    expect(excelDate).toBeInstanceOf(Date);
    rows[6] = definitions.stock.map((c) => c.key === "expiry_date" ? excelDate : c.key === "mfg_date" ? "01/03/2026" : c.example);
    expect(parseCsvObjects(importSheetToCsv(rows, "stock").csv)[0]).toMatchObject({ expiry_date: "2028-03-31", mfg_date: "2026-03-01", qty: "50", unit_cost_vnd: "95000" });
    rows[6][3] = "31/02/2028";
    expect(() => importSheetToCsv(rows, "stock")).toThrow("Dòng 7, Hạn sử dụng");
  });

  it("chấp nhận tiêu đề tiếng Việt khi người dùng bỏ phần mã cột", () => {
    const rows = [definitions.stock.map((c) => c.label + (c.required ? " *" : "")), definitions.stock.map((c) => c.example)];
    expect(importSheetToCsv(rows, "stock").lineNumbers).toEqual([2]);
  });

  it("chặn cột bắt buộc bị thiếu hoặc bị lặp", () => {
    const columns = definitions.stock.map((c) => c.key);
    const row: CellValue[] = definitions.stock.map((c) => c.example);
    expect(() => importSheetToCsv([columns.slice(1), row.slice(1)], "stock")).toThrow("cột bắt buộc");
    expect(() => importSheetToCsv([[...columns, "sku"], [...row, "X"]], "stock")).toThrow("cột trùng tên");
  });

  it("giữ CSV cũ và chặn file .xls, sai sheet, sai định dạng hoặc quá lớn", async () => {
    const csv = "sku,qty\n00123,5";
    expect(await readImportFile(new File([csv], "stock.csv"), "stock")).toEqual({ csv, lineNumbers: undefined });
    await expect(readImportFile(new File([csv], "stock.xls"), "stock")).rejects.toThrow(".xls cũ");
    await expect(readImportFile(new File([csv], "stock.xlsx"), "stock")).rejects.toThrow("Không đọc được");
    await expect(readImportFile(new File([new Uint8Array(await asset("stock"))], "stock.xlsx"), "products")).rejects.toThrow("San pham");
    await expect(readImportFile(new File([new Uint8Array(2 * 1024 * 1024 + 1)], "stock.xlsx"), "stock")).rejects.toThrow("2 MB");
  });
});
