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

const dataStyle = (c: SheetColumn) => (c.type === "date" ? S.date : c.type === "text" && c.key.startsWith("description") ? S.wrap : c.type === "text" || c.type === "yesno" ? S.text : S.number);

function inputSheet(columns: SheetColumn[], lists: TemplateLists, rows: TemplateRow[]) {
  const last = CATALOG_HEADER_ROW + Math.max(CATALOG_INPUT_ROWS, rows.length + 100);
  const firstStock = columns.findIndex((c) => c.group === "stock");
  const out: string[] = [
    row(1, [cell("A1", `${BRAND_NAME} — Nhập / cập nhật sản phẩm`, S.title)], 24),
    row(2, [cell("A2", "Mỗi dòng là một SKU. Cột đỏ (*) bắt buộc khi tạo sản phẩm mới. Tạo mới: để trống SKU. Cập nhật: điền SKU đã có, ô để trống = giữ nguyên.", S.note)]),
    row(3, [cell("A3", "Các dòng cùng tên + thương hiệu là các biến thể (màu/dung tích) của một sản phẩm. Chọn một ô để xem hướng dẫn của cột.", S.note)]),
    row(4, [cell("A4", "Phần NHẬP TỒN (cột xanh) tuỳ chọn: có Số lượng → tạo phiếu nhập nháp theo kho bán, kiểm tra rồi ghi sổ.", S.note)]),
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
  const cols = columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" style="${dataStyle(c)}" customWidth="1"/>`).join("");
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
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0" tabSelected="1"><pane ySplit="${CATALOG_HEADER_ROW}" topLeftCell="A${CATALOG_HEADER_ROW + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${CATALOG_HEADER_ROW + 1}" sqref="A${CATALOG_HEADER_ROW + 1}"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${out.join("")}</sheetData><dataValidations count="${validations.length}">${validations.join("")}</dataValidations></worksheet>`;
}

function guideSheet(columns: SheetColumn[]) {
  const rules = [
    "Tạo sản phẩm mới: điền Tên (Myanmar hoặc tiếng Anh), Thương hiệu, Danh mục, Giá bán; để trống SKU. Sản phẩm mới luôn ở trạng thái ẨN, bật hiển thị trong trang sản phẩm.",
    "Nhiều màu/dung tích: mỗi loại một dòng, cùng tên và thương hiệu, khác cột Biến thể.",
    "Cập nhật: tải file 'Danh sách sản phẩm hiện có', sửa ô cần đổi rồi tải lên. Ô để trống = giữ nguyên. Không đổi kho bán và combo qua Excel.",
    "Nhập tồn: điền Số lượng nhập và Giá mua; nhiều lô của cùng SKU thì lặp lại dòng với số lô/hạn khác nhau. Hệ thống tạo phiếu nhập NHÁP — kiểm tra rồi bấm Ghi sổ mới có tồn.",
    "Hàng có hạn dùng mà để trống Hạn sử dụng → lô chưa biết hạn, chưa bán được đến khi cập nhật hạn thật.",
    "Luôn bấm Xem trước để kiểm tra; chỉ khi không còn lỗi mới xác nhận được.",
  ];
  const head = row(1, [cell("A1", "Hướng dẫn nhập / cập nhật sản phẩm", S.title)], 24);
  const ruleRows = rules.map((r, i) => row(i + 3, [cell(`A${i + 3}`, `${i + 1}. ${r}`, S.note)]));
  const start = rules.length + 4;
  const table = [
    row(start, [cell(`A${start}`, "Cột", S.guideHead), cell(`B${start}`, "Bắt buộc khi tạo mới", S.guideHead), cell(`C${start}`, "Hướng dẫn", S.guideHead)]),
    ...columns.map((c, i) => row(start + 1 + i, [cell(`A${start + 1 + i}`, c.label, S.text), cell(`B${start + 1 + i}`, c.required ? "Có" : "", S.text), cell(`C${start + 1 + i}`, c.hint, S.wrap)])),
  ];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="26" customWidth="1"/><col min="2" max="2" width="18" customWidth="1"/><col min="3" max="3" width="90" customWidth="1"/></cols><sheetData>${[head, ...ruleRows, ...table].join("")}</sheetData></worksheet>`;
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

/** Ghép workbook. `rows` trống = file mẫu; có dữ liệu = danh sách SP hiện có để sửa. */
export function buildCatalogWorkbook(lists: TemplateLists, rows: TemplateRow[] = []): Uint8Array {
  // Chỉ một kho bán → bỏ cột Kho bán (luôn dùng kho đó).
  const columns = CATALOG_COLUMNS.filter((c) => c.key !== "warehouse_code" || lists.warehouses.length > 1);
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
