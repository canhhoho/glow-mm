import { strToU8, zipSync } from "fflate";
import {
  CATALOG_COLUMNS,
  CATALOG_HEADER_ROW,
  CATALOG_INPUT_ROWS,
  CATALOG_LIST_SHEET,
  CATALOG_SHEET,
  catalogLabels,
  type CatalogLabels,
  type SheetColumn,
  type SheetLocale,
} from "@/lib/catalog-sheet";
import { PRODUCT_SECTIONS } from "@/lib/product-fields";

/**
 * Sinh file Excel nhập/cập nhật sản phẩm lúc tải xuống (không dùng file tĩnh): tiêu đề cột ở dòng 1 theo ngôn ngữ admin
 * (cùng nhãn với form SP), gợi ý hiện khi chọn ô, danh sách thả xuống lấy từ dữ liệu thật (sheet ẩn). Không còn dòng
 * hướng dẫn / sheet hướng dẫn (16/11/2026). File mẫu trống và file SP hiện có cùng bộ cột.
 */

export type TemplateLists = { brands: string[]; categories: string[]; warehouses: string[] };
export type TemplateRow = Record<string, string | number | null | undefined>;

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

const dataStyle = (c: SheetColumn) => (c.type === "date" ? S.date : c.wrap ? S.wrap : c.type === "text" ? S.text : S.number);

function inputSheet(columns: SheetColumn[], lists: TemplateLists, rows: TemplateRow[], t: CatalogLabels) {
  const last = CATALOG_HEADER_ROW + Math.max(CATALOG_INPUT_ROWS, rows.length + 100);
  const out: string[] = [
    row(
      CATALOG_HEADER_ROW,
      columns.map((c, i) =>
        cell(`${colName(i)}${CATALOG_HEADER_ROW}`, t.label(c.key) + (c.required ? " *" : ""), c.group === "stock" ? S.headStock : c.required ? S.headRequired : S.headOptional),
      ),
      34,
    ),
    ...rows.map((values, r) => {
      const n = CATALOG_HEADER_ROW + 1 + r;
      return row(n, columns.map((c, i) => cell(`${colName(i)}${n}`, values[c.key], dataStyle(c))));
    }),
  ];
  // Cột phụ thu gọn (bấm dấu + phía trên cột). SKU chỉ thu gọn ở file mẫu trống — file cập nhật cần thấy SKU.
  const isHidden = (c: SheetColumn | undefined) => !!c?.collapsed && !(c.collapsedBlankOnly && rows.length > 0);
  const cols =
    columns
      .map((c, i) => {
        const hidden = isHidden(c);
        const collapsed = !hidden && isHidden(columns[i - 1]);
        return `<col min="${i + 1}" max="${i + 1}" width="${c.width}" style="${dataStyle(c)}" customWidth="1"${hidden ? ' hidden="1" outlineLevel="1"' : ""}${collapsed ? ' collapsed="1"' : ""}/>`;
      })
      .join("") + `<col min="${columns.length + 1}" max="${columns.length + 1}" width="3" customWidth="1" collapsed="1"/>`;
  const listCol = { brands: "A", categories: "B", warehouses: "C" } as const;
  const listLen = { brands: lists.brands.length, categories: lists.categories.length, warehouses: lists.warehouses.length };
  const validations = columns.map((c, i) => {
    const range = `${colName(i)}${CATALOG_HEADER_ROW + 1}:${colName(i)}${last}`;
    const prompt = `showInputMessage="1" promptTitle="${xml(t.label(c.key).slice(0, 32))}" prompt="${xml(t.hint(c.key).slice(0, 250))}"`;
    if (c.list && listLen[c.list] > 0) {
      const ref = `'${CATALOG_LIST_SHEET}'!$${listCol[c.list]}$2:$${listCol[c.list]}$${listLen[c.list] + 1}`;
      // Thương hiệu: cho gõ tên mới (không báo lỗi); các danh sách khác phải chọn đúng.
      const strict = c.list !== "brands";
      return `<dataValidation type="list" allowBlank="1" ${prompt} showErrorMessage="${strict ? 1 : 0}" errorTitle="${xml(t.label(c.key).slice(0, 32))}" error="${xml(t.listError)}" sqref="${range}"><formula1>${ref}</formula1></dataValidation>`;
    }
    return `<dataValidation allowBlank="1" ${prompt} sqref="${range}"/>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><outlinePr summaryRight="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" tabSelected="1" showOutlineSymbols="1"><pane ySplit="${CATALOG_HEADER_ROW}" topLeftCell="A${CATALOG_HEADER_ROW + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${CATALOG_HEADER_ROW + 1}" sqref="A${CATALOG_HEADER_ROW + 1}"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15" outlineLevelCol="1"/><cols>${cols}</cols><sheetData>${out.join("")}</sheetData><dataValidations count="${validations.length}">${validations.join("")}</dataValidations></worksheet>`;
}

function listSheet(lists: TemplateLists, t: CatalogLabels) {
  const cols = [
    [t.listTitle("brands"), lists.brands],
    [t.listTitle("categories"), lists.categories],
    [t.listTitle("warehouses"), lists.warehouses],
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
 * Ghép workbook. `rows` trống = file mẫu; có dữ liệu = danh sách SP hiện có để sửa (cùng bộ cột).
 * `locale`: ngôn ngữ tiêu đề / gợi ý (ngôn ngữ admin của người tải).
 */
export function buildCatalogWorkbook(lists: TemplateLists, rows: TemplateRow[] = [], opts: { locale?: SheetLocale } = {}): Uint8Array {
  const t = catalogLabels(opts.locale);
  // Chỉ một kho bán → bỏ cột Kho nhập (luôn dùng kho đó), như form không hiện ô kho. Cột theo thứ tự nhóm của form;
  // trong mỗi nhóm cột thu gọn xếp sau.
  const order = (c: SheetColumn) => PRODUCT_SECTIONS.indexOf(c.section ?? "main") * 2 + (c.collapsed && !c.collapsedBlankOnly ? 1 : 0);
  const columns = CATALOG_COLUMNS.filter((c) => c.key !== "warehouse_code" || lists.warehouses.length > 1).sort((a, b) => order(a) - order(b));
  const sheets = [
    { name: CATALOG_SHEET, body: inputSheet(columns, lists, rows, t) },
    { name: CATALOG_LIST_SHEET, body: listSheet(lists, t), hidden: true },
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
