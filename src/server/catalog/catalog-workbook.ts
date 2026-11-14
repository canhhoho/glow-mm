import { strToU8, zipSync } from "fflate";
import { BRAND_NAME } from "@/lib/brand";
import {
  CATALOG_COLUMNS,
  CATALOG_GUIDE_SHEET,
  CATALOG_HEADER_ROW,
  CATALOG_INPUT_ROWS,
  CATALOG_LIST_SHEET,
  CATALOG_SHEET,
  type SheetColumn,
} from "@/lib/catalog-sheet";

/**
 * Sinh file Excel nhập/cập nhật sản phẩm lúc tải xuống (không dùng file tĩnh):
 * sheet nhập liệu có tiêu đề màu, ghi chú khi chọn ô, danh sách thả xuống lấy từ dữ liệu thật,
 * sheet hướng dẫn và sheet danh sách (ẩn). Tuỳ chọn điền sẵn toàn bộ SKU hiện có để sửa rồi tải lên.
 */

export type TemplateLists = { brands: string[]; categories: string[]; warehouses: string[] };
export type TemplateRow = Record<string, string | number | null | undefined>;

const YES_NO = ["Có", "Không"];
// Giá/hoa hồng đặt ở bước Giá. Các cột phụ vẫn có thể mở bằng dấu + trong Excel.
const PRICING_COLUMNS = new Set(["price_mmk", "affiliate_commission_mmk"]);
// Khối lượng + mô tả luôn hiện (cần để đăng bán / khách thấy); nội dung phụ và mã thu gọn.
const EXTRA_COLUMNS = new Set(["usage_my", "usage_en", "ingredients", "storage_note", "pao_months", "has_expiry", "sku", "inbound_unit_vnd", "lot_no"]);
const WRAP_COLUMNS = new Set(["description_my", "description_en", "usage_my", "usage_en", "ingredients", "storage_note"]);

const xml = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const colName = (index: number) => {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    out = String.fromCharCode(65 + m) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};

// Thứ tự trong styles.xml (cellXfs).
const S = { title: 1, note: 2, headRequired: 3, headOptional: 4, headStock: 5, text: 6, number: 7, date: 8, group: 9, wrap: 10, guideHead: 11 } as const;

function cell(ref: string, value: string | number | null | undefined, style: number) {
  if (value == null || value === "") return `<c r="${ref}" s="${style}"/>`;
  if (typeof value === "number") return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

const row = (r: number, cells: string[], height?: number) =>
  `<row r="${r}"${height ? ` ht="${height}" customHeight="1"` : ""}>${cells.join("")}</row>`;

const dataStyle = (c: SheetColumn) => (c.type === "date" ? S.date : WRAP_COLUMNS.has(c.key) ? S.wrap : c.type === "text" || c.type === "yesno" ? S.text : S.number);

function inputSheet(columns: SheetColumn[], lists: TemplateLists, rows: TemplateRow[]) {
  const last = CATALOG_HEADER_ROW + Math.max(CATALOG_INPUT_ROWS, rows.length + 100);
  const firstStock = columns.findIndex((c) => c.group === "stock");
  const out: string[] = [
    row(1, [cell("A1", `${BRAND_NAME} — Nhập / cập nhật sản phẩm`, S.title)], 24),
    row(2, [cell("A2", "Bắt buộc (*): một tên (Myanmar hoặc tiếng Anh), Thương hiệu, Danh mục. Nên điền: Khối lượng (bắt buộc trước khi đăng bán hàng kho nhập VN) và Mô tả hai thứ tiếng.", S.note)]),
    row(3, [cell("A3", "Mỗi dòng một biến thể; cùng tên + thương hiệu để gộp sản phẩm. Bấm dấu + phía trên cột để mở Cách dùng, Thành phần, Bảo quản, PAO, SKU… Ô trống giữ nguyên.", S.note)]),
    row(4, [cell("A4", "Tự sinh: mã SP, SKU, số lô. Làm tiếp trên web: giá bán (bước 3), ảnh, ghi sổ phiếu nhập, gửi duyệt → duyệt → đăng bán. Cột xanh = nhập tồn (tuỳ chọn).", S.note)]),
    row(5, [cell("A5", "SẢN PHẨM", S.group), ...(firstStock >= 0 ? [cell(`${colName(firstStock)}5`, "NHẬP TỒN (tuỳ chọn)", S.group)] : [])]),
    row(
      CATALOG_HEADER_ROW,
      columns.map((c, i) => cell(`${colName(i)}${CATALOG_HEADER_ROW}`, c.label + (c.required ? " *" : ""), c.group === "stock" ? S.headStock : c.required ? S.headRequired : S.headOptional)),
      34,
    ),
    ...rows.map((values, r) => {
      const n = CATALOG_HEADER_ROW + 1 + r;
      return row(n, columns.map((c, i) => cell(`${colName(i)}${n}`, values[c.key], dataStyle(c))));
    }),
  ];
  const cols = columns.map((c, i) => {
    // SKU của file cập nhật phải luôn thấy để nhận diện đúng dòng cần sửa.
    const hidden = EXTRA_COLUMNS.has(c.key) && !(c.key === "sku" && rows.length > 0);
    const previous = columns[i - 1];
    const collapsed = !hidden && previous && EXTRA_COLUMNS.has(previous.key) && !(previous.key === "sku" && rows.length > 0);
    return `<col min="${i + 1}" max="${i + 1}" width="${c.width}" style="${dataStyle(c)}" customWidth="1"${hidden ? ' hidden="1" outlineLevel="1"' : ""}${collapsed ? ' collapsed="1"' : ""}/>`;
  }).join("") + `<col min="${columns.length + 1}" max="${columns.length + 1}" width="3" customWidth="1" collapsed="1"/>`;
  const listCol = { brands: "A", categories: "B", warehouses: "C", yesno: "D" } as const;
  const listLen = { brands: lists.brands.length, categories: lists.categories.length, warehouses: lists.warehouses.length, yesno: YES_NO.length };
  const validations = columns.map((c, i) => {
    const range = `${colName(i)}${CATALOG_HEADER_ROW + 1}:${colName(i)}${last}`;
    const prompt = `showInputMessage="1" promptTitle="${xml(c.label.slice(0, 32))}" prompt="${xml(c.hint.slice(0, 250))}"`;
    if (c.list && listLen[c.list] > 0) {
      const ref = `'${CATALOG_LIST_SHEET}'!$${listCol[c.list]}$2:$${listCol[c.list]}$${listLen[c.list] + 1}`;
      // Thương hiệu: cho gõ tên mới (không báo lỗi); các danh sách khác phải chọn đúng.
      const strict = c.list !== "brands";
      return `<dataValidation type="list" allowBlank="1" ${prompt} showErrorMessage="${strict ? 1 : 0}" errorTitle="${xml(c.label)}" error="Chọn một giá trị trong danh sách." sqref="${range}"><formula1>${ref}</formula1></dataValidation>`;
    }
    return `<dataValidation allowBlank="1" ${prompt} sqref="${range}"/>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><outlinePr summaryRight="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" tabSelected="1" showOutlineSymbols="1"><pane ySplit="${CATALOG_HEADER_ROW}" topLeftCell="A${CATALOG_HEADER_ROW + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${CATALOG_HEADER_ROW + 1}" sqref="A${CATALOG_HEADER_ROW + 1}"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15" outlineLevelCol="1"/><cols>${cols}</cols><sheetData>${out.join("")}</sheetData><dataValidations count="${validations.length}">${validations.join("")}</dataValidations></worksheet>`;
}

/** Cột "Khi tạo mới" của sheet hướng dẫn: bắt buộc / nên điền / tự sinh / tuỳ chọn. */
function requirement(c: SheetColumn): string {
  if (c.required) return "Bắt buộc";
  if (c.key === "name_my" || c.key === "name_en") return "Bắt buộc (một trong hai tên)";
  if (c.key === "weight_g") return "Bắt buộc trước khi đăng (kho nhập VN)";
  if (c.key === "description_my" || c.key === "description_en") return "Nên điền";
  if (c.key === "sku" || c.key === "lot_no") return "Để trống = tự sinh";
  if (c.key === "price_mmk" || c.key === "affiliate_commission_mmk") return "Không dùng (SKU mới giá 0)";
  if (c.key === "qty") return "Tuỳ chọn (có = tạo phiếu nhập nháp)";
  if (c.key === "unit_cost") return "Bắt buộc nếu nhập tồn";
  return "Tuỳ chọn";
}

function guideSheet(columns: SheetColumn[]) {
  const rules = [
    "Bắt buộc khi tạo mới (*): ít nhất một tên (Myanmar hoặc tiếng Anh; thiếu tên nào dùng tên còn lại), Thương hiệu (chọn hoặc gõ tên mới) và Danh mục (phải có sẵn — tạo ở trang Danh mục trước).",
    "Nên điền ngay: Khối lượng (g) — bắt buộc trước khi gửi duyệt / đăng bán với kho hàng nhập Việt Nam; Mô tả Myanmar và tiếng Anh — trang tiếng Anh không tự lấy mô tả Myanmar.",
    "Nhiều màu/dung tích: mỗi loại một dòng, cùng tên và thương hiệu, khác cột Biến thể. Để trống Biến thể = một loại tiêu chuẩn.",
    "Cột thu gọn (bấm dấu + phía trên cột): Cách dùng, Thành phần, Bảo quản, Hạn sau mở nắp (PAO), Có hạn dùng, SKU, Phí đưa về kho, Số lô. Tạo mới để trống SKU.",
    "Hệ thống tự sinh: mã sản phẩm (đường dẫn), SKU, số lô. Sản phẩm mới ở trạng thái ẨN, CHƯA DUYỆT, giá bán 0.",
    "Làm tiếp trên trang sản phẩm để khách thấy: Ghi sổ phiếu nhập (nếu có tồn) → đặt Giá bán ở bước 3 → thêm Ảnh (nên có) → Gửi duyệt → Duyệt → Đăng bán. Điều kiện đăng: giá > 0, có khối lượng (kho nhập VN), kho bán hợp lệ, đã duyệt.",
    "Cập nhật: tải file 'Danh sách sản phẩm hiện có', giữ SKU và sửa thông tin cần đổi. Ô trống = giữ nguyên (không xoá nội dung qua Excel). Không đổi kho bán / combo qua Excel. Cột Giá bán, Hoa hồng CTV chỉ có trong file của người có quyền giá và chỉ sửa SKU đã có.",
    "Nhập tồn (cột xanh, tuỳ chọn): Số lượng + Giá mua (VND cho kho nhập Việt Nam, MMK cho kho mua tại Myanmar). Giá mua để tính vốn, không phải giá bán. Phiếu nhập là NHÁP, kiểm tra rồi Ghi sổ mới có tồn. Số viết 150000, 150,000 hoặc 150.000 đều được.",
    "Hàng có hạn dùng mà để trống Hạn sử dụng → lô chưa biết hạn, chưa bán được đến khi cập nhật hạn thật. Ngày theo dd/mm/yyyy.",
    "Luôn bấm Xem trước để kiểm tra; chỉ khi không còn lỗi mới xác nhận được.",
  ];
  const head = row(1, [cell("A1", "Hướng dẫn nhập / cập nhật sản phẩm", S.title)], 24);
  const ruleRows = rules.map((r, i) => row(i + 3, [cell(`A${i + 3}`, `${i + 1}. ${r}`, S.wrap)], 44));
  const start = rules.length + 4;
  const table = [
    row(start, [cell(`A${start}`, "Cột", S.guideHead), cell(`B${start}`, "Khi tạo mới", S.guideHead), cell(`C${start}`, "Hướng dẫn", S.guideHead)]),
    ...columns.map((c, i) => row(start + 1 + i, [cell(`A${start + 1 + i}`, c.label, S.text), cell(`B${start + 1 + i}`, requirement(c), S.text), cell(`C${start + 1 + i}`, c.hint, S.wrap)], 44)),
  ];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="26" customWidth="1"/><col min="2" max="2" width="18" customWidth="1"/><col min="3" max="3" width="90" customWidth="1"/></cols><sheetData>${[head, ...ruleRows, ...table].join("")}</sheetData><mergeCells count="${rules.length + 1}"><mergeCell ref="A1:C1"/>${rules.map((_, i) => `<mergeCell ref="A${i + 3}:C${i + 3}"/>`).join("")}</mergeCells></worksheet>`;
}

function listSheet(lists: TemplateLists) {
  const cols = [
    ["Thương hiệu", lists.brands],
    ["Danh mục", lists.categories],
    ["Kho bán", lists.warehouses],
    ["Có/Không", YES_NO],
  ] as const;
  const height = Math.max(...cols.map(([, v]) => v.length)) + 1;
  const rows = Array.from({ length: height }, (_, r) =>
    row(r + 1, cols.map(([title, values], c) => cell(`${colName(c)}${r + 1}`, r === 0 ? title : values[r - 1], r === 0 ? S.guideHead : S.text))),
  );
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.join("")}</sheetData></worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FFB83A50"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF555555"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF6C9D1"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEDEDED"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD3EBDD"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8657A"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFCCCCCC"/></left><right style="thin"><color rgb="FFCCCCCC"/></right><top style="thin"><color rgb="FFCCCCCC"/></top><bottom style="thin"><color rgb="FFCCCCCC"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="12">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>
<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/**
 * Ghép workbook. `rows` trống = file mẫu; có dữ liệu = danh sách SP hiện có để sửa. `pricing` (P2): file SP hiện có
 * cho người có quyền giá kèm cột Giá bán + Hoa hồng CTV (sửa giá hàng loạt rồi tải lên lại; vẫn qua duyệt).
 */
export function buildCatalogWorkbook(lists: TemplateLists, rows: TemplateRow[] = [], opts: { pricing?: boolean } = {}): Uint8Array {
  // Chỉ một kho bán → bỏ cột Kho bán (luôn dùng kho đó).
  const columns = CATALOG_COLUMNS
    .filter((c) => (opts.pricing || !PRICING_COLUMNS.has(c.key)) && (c.key !== "warehouse_code" || lists.warehouses.length > 1))
    .sort((a, b) => {
      const order = (c: SheetColumn) => c.group === "product" ? EXTRA_COLUMNS.has(c.key) ? 1 : 0 : EXTRA_COLUMNS.has(c.key) ? 3 : 2;
      return order(a) - order(b);
    });
  const sheets = [
    { name: CATALOG_SHEET, body: inputSheet(columns, lists, rows) },
    { name: CATALOG_GUIDE_SHEET, body: guideSheet(columns) },
    { name: CATALOG_LIST_SHEET, body: listSheet(lists), hidden: true },
  ];
  const ct = "application/vnd.openxmlformats-officedocument";
  return zipSync({
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${ct}.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${ct}.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="${ct}.spreadsheetml.styles+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}"${s.hidden ? ' state="hidden"' : ""} r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml": strToU8(STYLES),
    ...Object.fromEntries(sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, strToU8(s.body)])),
  });
}
