import { describe, expect, it } from "vitest";
import { readSheet } from "read-excel-file/node";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { CATALOG_HEADER_ROW, CATALOG_LIST_SHEET, CATALOG_SHEET, parseYesNo, sheetHeaderKey } from "@/lib/catalog-sheet";
import { parseCsvObjects } from "@/lib/csv";
import { buildCatalogWorkbook } from "@/server/catalog/catalog-workbook";
import { readCatalogFile, sheetRowsToCsv } from "@/server/catalog/catalog-sheet-read";

const lists = { brands: ["Sen Việt", "Cocoon"], categories: ["Skincare", "Makeup"], warehouses: ["THAM", "CHI"] };
const asFile = (bytes: Uint8Array, name = "nhap.xlsx") => new File([Buffer.from(bytes)], name);

describe("File Excel nhập/cập nhật sản phẩm (một sheet)", () => {
  it("mẫu trống: đọc được, báo chưa có dữ liệu; có sheet hướng dẫn và danh sách ẩn", async () => {
    const bytes = buildCatalogWorkbook(lists);
    await expect(readCatalogFile(asFile(bytes))).rejects.toThrow("File chưa có dữ liệu");
    const files = unzipSync(bytes);
    expect(strFromU8(files["xl/workbook.xml"])).toContain(`name="${CATALOG_LIST_SHEET}" sheetId="3" state="hidden"`);
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
    // Danh sách thả xuống: danh mục/kho/Có-Không chặn giá trị lạ, thương hiệu cho gõ tên mới.
    expect(sheet).toContain(`<formula1>'${CATALOG_LIST_SHEET}'!$B$2:$B$3</formula1>`);
    expect(sheet).toMatch(/showErrorMessage="0"[^>]*><formula1>'Danh sach'!\$A\$2:\$A\$3/);
    const list = await readSheet(Buffer.from(bytes), CATALOG_LIST_SHEET);
    expect(list.map((r) => r[1]).filter(Boolean)).toEqual(["Danh mục", "Skincare", "Makeup"]);
  });

  it("chỉ một kho bán → không có cột Kho bán", async () => {
    const rows = await readSheet(Buffer.from(buildCatalogWorkbook({ ...lists, warehouses: ["THAM"] })), CATALOG_SHEET);
    const header = rows[CATALOG_HEADER_ROW - 1].map(sheetHeaderKey);
    expect(header).not.toContain("warehouse_code");
    expect(header).toEqual(expect.arrayContaining(["name_my", "brand", "category", "price_mmk", "sku", "qty", "unit_cost", "lot_no"]));
  });

  it("file SP hiện có: đọc lại đúng giá trị, giữ SKU số 0 đầu, xuống dòng và chữ Myanmar", async () => {
    const bytes = buildCatalogWorkbook(lists, [
      { name_my: "နေကာခရင်မ်", name_en: "Sunscreen", brand: "Sen Việt", category: "Skincare", variant_label: "50ml", price_mmk: 25000, weight_g: 80, description_en: "Line 1\nLine 2", warehouse_code: "THAM", has_expiry: "Có", sku: "000123" },
    ]);
    const { csv, lines } = await readCatalogFile(asFile(bytes));
    expect(lines).toEqual([CATALOG_HEADER_ROW + 1]);
    expect(parseCsvObjects(csv)[0]).toMatchObject({ name_my: "နေကာခရင်မ်", sku: "000123", price_mmk: "25000", weight_g: "80", description_en: "Line 1\nLine 2", has_expiry: "Có", qty: "" });
  });

  it("đọc ngày Excel và dd/mm/yyyy; ngày sai báo đúng dòng", () => {
    const header = ["Tên Myanmar", "Thương hiệu *", "Danh mục *", "Hạn sử dụng", "SKU"];
    const ok = sheetRowsToCsv([["tiêu đề"], header, ["A", "B", "C", new Date("2028-03-31T00:00:00Z"), "X"], [], ["A", "B", "C", "01/02/2029", "Y"]]);
    expect(ok.lines).toEqual([3, 5]);
    expect(parseCsvObjects(ok.csv).map((r) => r.expiry_date)).toEqual(["2028-03-31", "2029-02-01"]);
    expect(() => sheetRowsToCsv([header, ["A", "B", "C", "31/02/2028", "X"]])).toThrow("Dòng 2");
  });

  it("nhận cột của mẫu cũ (khoá và nhãn), chặn cột lặp và thiếu cột chính", () => {
    const legacy = sheetRowsToCsv([
      ["product_slug", "name_en", "brand", "Mã danh mục", "Mã SKU", "pao_months", "Giá mua (VND/đv)", "expiry_policy"],
      ["kem-a", "Cream", "Sen Việt", "skincare", "KA-1", "12", "90000", "NONE"],
    ]);
    expect(parseCsvObjects(legacy.csv)[0]).toMatchObject({ product_slug: "kem-a", category: "skincare", sku: "KA-1", pao_months: "12", unit_cost_vnd: "90000", has_expiry: "NONE" });
    expect(() => sheetRowsToCsv([["Tên Myanmar", "Thương hiệu", "Danh mục", "SKU", "Mã SKU"], ["a", "b", "c", "d", "e"]])).toThrow("cột trùng tên");
    expect(() => sheetRowsToCsv([["Tên Myanmar", "Thương hiệu"], ["a", "b"]])).toThrow("hàng tiêu đề");
    expect([parseYesNo("Có"), parseYesNo("không"), parseYesNo("NONE"), parseYesNo(""), parseYesNo("có lẽ")]).toEqual([true, false, false, undefined, null]);
  });

  it("CSV vẫn nhận; chặn .xls, file quá lớn và file mẫu cũ hai sheet", async () => {
    const csv = "name_en,brand,category,price_mmk\nCream,Sen Việt,skincare,1000";
    expect(parseCsvObjects((await readCatalogFile(new File([csv], "a.csv"))).csv)[0]).toMatchObject({ name_en: "Cream", price_mmk: "1000" });
    await expect(readCatalogFile(new File([csv], "a.xls"))).rejects.toThrow(".xls cũ");
    await expect(readCatalogFile(new File([new Uint8Array(2 * 1024 * 1024 + 1)], "a.xlsx"))).rejects.toThrow("2 MB");
    // Mẫu cũ: sheet "San pham" + "Ton dau ky" (dựng lại bằng cách đổi tên sheet của file mới).
    const files = unzipSync(buildCatalogWorkbook(lists));
    files["xl/workbook.xml"] = strToU8(strFromU8(files["xl/workbook.xml"]).replace(`name="${CATALOG_SHEET}"`, 'name="San pham"').replace('name="Huong dan"', 'name="Ton dau ky"'));
    await expect(readCatalogFile(asFile(zipSync(files), "opening.xlsx"))).rejects.toThrow("file mẫu cũ");
  });
});
