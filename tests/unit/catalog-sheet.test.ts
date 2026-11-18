import { describe, expect, it } from "vitest";
import { readSheet } from "read-excel-file/node";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { CATALOG_COLUMNS, CATALOG_HEADER_ROW, CATALOG_LIST_SHEET, CATALOG_SHEET, catalogLabels, normalizeNumberText, parseYesNo, sheetHeaderKey } from "@/lib/catalog-sheet";
import { PRODUCT_FIELDS, PRODUCT_SECTIONS } from "@/lib/product-fields";
import { parseCsvObjects } from "@/lib/csv";
import { buildCatalogWorkbook } from "@/server/catalog/catalog-workbook";
import { readCatalogFile, sheetRowsToCsv } from "@/server/catalog/catalog-sheet-read";
import adminVi from "../../messages/admin.vi.json";
import adminEn from "../../messages/admin.en.json";
import adminMy from "../../messages/admin.my.json";
import { addCatalogSheet } from "../support/catalog-workbook";

const lists = { brands: ["Sen Việt", "Cocoon"], categories: ["Skincare", "Makeup"], warehouses: ["THAM", "CHI"] };
const asFile = (bytes: Uint8Array, name = "nhap.xlsx") => new File([Buffer.from(bytes)], name);
const headerOf = async (bytes: Uint8Array) => (await readSheet(Buffer.from(bytes), CATALOG_SHEET))[CATALOG_HEADER_ROW - 1];

describe("Bộ trường SP dùng chung (form + Excel)", () => {
  it("mọi trường có nhãn + gợi ý ở cả 3 ngôn ngữ admin; mọi nhóm có tên", () => {
    for (const m of [adminVi, adminEn, adminMy]) {
      const pf = m.ProductFields as unknown as Record<string, { label: string; hint: string }> & { sections: Record<string, string> };
      for (const f of PRODUCT_FIELDS) {
        expect(pf[f.key]?.label, f.key).toBeTruthy();
        expect(pf[f.key]?.hint, f.key).toBeTruthy();
      }
      for (const s of PRODUCT_SECTIONS) expect(pf.sections[s]).toBeTruthy();
    }
  });

  it("cột Excel = trường có `excel`; không còn tên Myanmar, giá, hoa hồng, 'Có hạn dùng'", () => {
    expect(CATALOG_COLUMNS.map((c) => c.key)).toEqual(PRODUCT_FIELDS.filter((f) => f.excel).map((f) => f.key));
    for (const gone of ["name_my", "name_en", "price_mmk", "affiliate_commission_mmk", "has_expiry"]) expect(CATALOG_COLUMNS.map((c) => c.key)).not.toContain(gone);
  });

  it("tiêu đề nhận cả 3 ngôn ngữ và nhãn/khoá của mẫu cũ", () => {
    for (const locale of ["vi", "en", "my"] as const) {
      const t = catalogLabels(locale);
      for (const c of CATALOG_COLUMNS) expect(sheetHeaderKey(`${t.label(c.key)}${c.required ? " *" : ""}`)).toBe(c.key);
    }
    expect(["Tên tiếng Anh", "name_en", "Biến thể", "Kho bán", "Mã SKU"].map(sheetHeaderKey)).toEqual(["name", "name", "variant_label", "warehouse_code", "sku"]);
    expect(["Tên Myanmar", "Giá bán (MMK)", "Hoa hồng CTV", "Có hạn dùng"].map(sheetHeaderKey)).toEqual(["name_my", "price_mmk", "affiliate_commission_mmk", "has_expiry"]);
  });
});

describe("File Excel nhập/cập nhật sản phẩm (một sheet)", () => {
  it("mẫu trống: tiêu đề ở dòng 1, không còn dòng/sheet hướng dẫn; danh sách ẩn; đọc được và báo chưa có dữ liệu", async () => {
    const bytes = buildCatalogWorkbook(lists);
    expect(CATALOG_HEADER_ROW).toBe(1);
    await expect(readCatalogFile(asFile(bytes))).rejects.toThrow("File chưa có dữ liệu");
    const files = unzipSync(bytes);
    const workbook = strFromU8(files["xl/workbook.xml"]);
    expect(workbook).toContain(`name="${CATALOG_LIST_SHEET}" sheetId="2" state="hidden"`);
    expect(workbook).not.toContain("Huong dan");
    expect(Object.keys(files).filter((f) => f.startsWith("xl/worksheets/"))).toHaveLength(2);
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
    expect(sheet).toMatch(/^[\s\S]*<sheetData><row r="1"/);
    // Danh sách thả xuống: danh mục/kho chặn giá trị lạ, thương hiệu cho gõ tên mới.
    expect(sheet).toContain(`<formula1>'${CATALOG_LIST_SHEET}'!$B$2:$B$3</formula1>`);
    expect(sheet).toMatch(/showErrorMessage="0"[^>]*><formula1>'Danh sach'!\$A\$2:\$A\$3/);
    const list = await readSheet(Buffer.from(bytes), CATALOG_LIST_SHEET);
    expect(list.map((r) => r[1]).filter(Boolean)).toEqual(["Danh mục", "Skincare", "Makeup"]);
  });

  it("tiêu đề theo ngôn ngữ admin; mẫu trống và file SP hiện có cùng bộ cột theo thứ tự nhóm của form", async () => {
    const vi = buildCatalogWorkbook(lists);
    const en = buildCatalogWorkbook(lists, [], { locale: "en" });
    const filled = buildCatalogWorkbook(lists, [{ name: "Cream", brand: "Sen Việt", category: "Skincare", sku: "000123" }]);
    expect((await headerOf(vi))[0]).toBe("Tên sản phẩm *");
    expect((await headerOf(en))[0]).toBe("Product name *");
    const keys = (await headerOf(vi)).map(sheetHeaderKey);
    expect((await headerOf(en)).map(sheetHeaderKey)).toEqual(keys);
    expect((await headerOf(filled)).map(sheetHeaderKey)).toEqual(keys);
    expect(keys).toEqual([
      "name", "brand", "category", "variant_label", "sku", "weight_g", "description_my", "description_en",
      "usage_my", "usage_en", "ingredients", "storage_note", "pao_months",
      "warehouse_code", "qty", "expiry_date", "unit_cost", "lot_no",
    ]);
  });

  it("chỉ một kho bán → không có cột Kho nhập", async () => {
    const keys = (await headerOf(buildCatalogWorkbook({ ...lists, warehouses: ["THAM"] }))).map(sheetHeaderKey);
    expect(keys).not.toContain("warehouse_code");
    expect(keys).toEqual(expect.arrayContaining(["name", "brand", "category", "sku", "qty", "unit_cost", "lot_no"]));
  });

  it("cột phụ thu gọn; SKU chỉ thu gọn ở file mẫu trống", async () => {
    for (const rows of [[], [{ name: "Cream", brand: "Sen Việt", category: "Skincare", sku: "000123" }]]) {
      const bytes = buildCatalogWorkbook(lists, rows);
      const sheet = strFromU8(unzipSync(bytes)["xl/worksheets/sheet1.xml"]);
      const header = (await headerOf(bytes)).map(sheetHeaderKey);
      const colTags = [...sheet.matchAll(/<col\s[^>]*\/>/g)].map((m) => m[0]);
      const visible = header.filter((_, i) => !colTags[i].includes('hidden="1"'));
      expect(visible).toEqual(["name", "brand", "category", "variant_label", ...(rows.length ? ["sku"] : []), "weight_g", "description_my", "description_en", "warehouse_code", "qty", "expiry_date", "unit_cost"]);
      expect(sheet).toContain('outlineLevel="1"');
    }
  });

  it("file SP hiện có: đọc lại đúng giá trị, giữ SKU số 0 đầu, xuống dòng và chữ Myanmar", async () => {
    const bytes = buildCatalogWorkbook(lists, [
      { name: "Sunscreen", brand: "Sen Việt", category: "Skincare", variant_label: "50ml", weight_g: 80, description_my: "နေကာခရင်မ်", description_en: "Line 1\nLine 2", warehouse_code: "THAM", sku: "000123" },
    ]);
    const { csv, lines } = await readCatalogFile(asFile(bytes));
    expect(lines).toEqual([CATALOG_HEADER_ROW + 1]);
    expect(parseCsvObjects(csv)[0]).toMatchObject({ name: "Sunscreen", sku: "000123", weight_g: "80", description_my: "နေကာခရင်မ်", description_en: "Line 1\nLine 2", qty: "" });
  });

  it("chỉ đọc dữ liệu của sheet đã chọn, tên có dấu và báo lỗi nếu sheet không tồn tại", async () => {
    const first = buildCatalogWorkbook(lists, [{ name: "First sheet only", sku: "FIRST" }]);
    const second = buildCatalogWorkbook(lists, [{ name: "Second sheet only", sku: "SECOND", qty: 4 }]);
    const name = "Đợt 2 & bổ sung";
    const file = asFile(addCatalogSheet(first, second, name));
    const chosen = await readCatalogFile(file, name);
    expect(chosen.sheetName).toBe(name);
    expect(chosen.lines).toEqual([2]);
    expect(parseCsvObjects(chosen.csv)).toEqual([expect.objectContaining({ name: "Second sheet only", sku: "SECOND", qty: "4" })]);
    await expect(readCatalogFile(file, "Không tồn tại")).rejects.toThrow("Không tìm thấy sheet đã chọn");
  });

  it("đọc ngày Excel và dd/mm/yyyy; ô Hạn sử dụng 'Không' = không hạn; ngày sai báo đúng dòng", () => {
    const header = ["Tên sản phẩm", "Thương hiệu *", "Danh mục *", "Hạn sử dụng", "SKU"];
    const ok = sheetRowsToCsv([["tiêu đề cũ"], header, ["A", "B", "C", new Date("2028-03-31T00:00:00Z"), "X"], [], ["A", "B", "C", "01/02/2029", "Y"], ["A", "B", "C", "Không", "Z"]]);
    expect(ok.lines).toEqual([3, 5, 6]);
    expect(parseCsvObjects(ok.csv).map((r) => r.expiry_date)).toEqual(["2028-03-31", "2029-02-01", "NONE"]);
    expect(() => sheetRowsToCsv([header, ["A", "B", "C", "31/02/2028", "X"]])).toThrow("Dòng 2");
  });

  it("ô số: bỏ phân cách nghìn (150.000 / 150,000 / khoảng trắng), giữ số Excel, số lẻ để báo lỗi", () => {
    expect(["150.000", "150,000", "1.250.000", " 150 000 ", "150000", "1.5", "12"].map(normalizeNumberText)).toEqual(["150000", "150000", "1250000", "150000", "150000", "1.5", "12"]);
    const header = ["Tên sản phẩm", "Thương hiệu", "Danh mục", "Số lượng nhập", "Giá mua/đv", "Khối lượng (g)", "Hạn sau mở nắp (tháng)"];
    const read = sheetRowsToCsv([header, ["A", "B", "C", "1,200", "150.000", 85, "12"]]);
    expect(parseCsvObjects(read.csv)[0]).toMatchObject({ qty: "1200", unit_cost: "150000", weight_g: "85", pao_months: "12" });
  });

  it("nhận file mẫu cũ (tiêu đề ở dòng 6, khoá cũ); file chỉ có SKU + cột cần sửa cũng nhận; chặn cột lặp / thiếu Tên và SKU", () => {
    const legacy = sheetRowsToCsv([
      ["Nhập / cập nhật sản phẩm"], ["ghi chú"], ["ghi chú"], ["ghi chú"], ["SẢN PHẨM"],
      ["product_slug", "Tên Myanmar", "name_en", "brand", "Mã danh mục", "Mã SKU", "pao_months", "Giá mua (VND/đv)", "expiry_policy", "Giá bán (MMK)"],
      ["kem-a", "ခရင်မ်", "Cream", "Sen Việt", "skincare", "KA-1", "12", "90000", "NONE", "25000"],
    ]);
    expect(legacy.lines).toEqual([7]);
    expect(parseCsvObjects(legacy.csv)[0]).toMatchObject({ product_slug: "kem-a", name_my: "ခရင်မ်", name: "Cream", category: "skincare", sku: "KA-1", unit_cost_vnd: "90000", has_expiry: "NONE", price_mmk: "25000" });
    expect(parseCsvObjects(sheetRowsToCsv([["SKU", "Khối lượng (g)"], ["KA-1", "90"]]).csv)[0]).toMatchObject({ sku: "KA-1", weight_g: "90" });
    expect(() => sheetRowsToCsv([["Tên sản phẩm", "Thương hiệu", "SKU", "Mã SKU"], ["a", "b", "d", "e"]])).toThrow("cột trùng tên");
    expect(() => sheetRowsToCsv([["Thương hiệu", "Danh mục"], ["a", "b"]])).toThrow("hàng tiêu đề");
    expect([parseYesNo("Có"), parseYesNo("không"), parseYesNo("NONE"), parseYesNo(""), parseYesNo("có lẽ")]).toEqual([true, false, false, undefined, null]);
  });

  it("CSV vẫn nhận; chặn .xls, file quá lớn và file mẫu cũ hai sheet", async () => {
    const csv = "name,brand,category\nCream,Sen Việt,skincare";
    expect(parseCsvObjects((await readCatalogFile(new File([csv], "a.csv"))).csv)[0]).toMatchObject({ name: "Cream" });
    await expect(readCatalogFile(new File([csv], "a.xls"))).rejects.toThrow(".xls cũ");
    await expect(readCatalogFile(new File([new Uint8Array(2 * 1024 * 1024 + 1)], "a.xlsx"))).rejects.toThrow("2 MB");
    // Mẫu cũ: sheet "San pham" + "Ton dau ky" (dựng lại bằng cách đổi tên hai sheet của file mới).
    const files = unzipSync(buildCatalogWorkbook(lists));
    files["xl/workbook.xml"] = strToU8(strFromU8(files["xl/workbook.xml"]).replace(`name="${CATALOG_SHEET}"`, 'name="San pham"').replace(`name="${CATALOG_LIST_SHEET}"`, 'name="Ton dau ky"'));
    await expect(readCatalogFile(asFile(zipSync(files), "opening.xlsx"))).rejects.toThrow("file mẫu cũ");
  });
});
