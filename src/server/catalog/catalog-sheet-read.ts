import "server-only";
import { readSheet, type CellValue } from "read-excel-file/node";
import { parseCsv, toCsv } from "@/lib/csv";
import { ALL_SHEET_COLUMNS, CATALOG_SHEET, normalizeNumberText, sheetHeaderKey } from "@/lib/catalog-sheet";

/** Đọc file nhập/cập nhật sản phẩm (một sheet). Trả CSV khoá chuẩn + số dòng Excel để báo lỗi. */

const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_SHEET_ROWS = 5000;
const TYPES = new Map(ALL_SHEET_COLUMNS.map((c) => [c.key, c.type]));

function dateValue(value: CellValue | Date, line: number): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  const local = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  const iso = local ? `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}` : text;
  const date = new Date(`${iso}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== iso) {
    throw new Error(`Dòng ${line}: ngày "${text}" không hợp lệ — nhập theo dd/mm/yyyy, ví dụ 31/03/2028.`);
  }
  return iso;
}

const isHeader = (keys: string[]) => keys.includes("brand") && keys.includes("category") && (keys.includes("name_my") || keys.includes("name_en") || keys.includes("sku"));

/** Bảng ô (Excel hoặc CSV) → CSV khoá chuẩn. Bỏ qua tiêu đề/ghi chú phía trên và dòng trống. */
export function sheetRowsToCsv(rows: (CellValue | Date | null)[][]) {
  const headerIndex = rows.slice(0, 20).findIndex((r) => isHeader(r.map(sheetHeaderKey)));
  if (headerIndex < 0) throw new Error(`Không tìm thấy hàng tiêu đề (cần ít nhất cột Tên, Thương hiệu, Danh mục). Hãy dùng file mẫu mới, sheet "${CATALOG_SHEET}".`);
  const keys = rows[headerIndex].map(sheetHeaderKey);
  const used = keys.filter(Boolean);
  if (new Set(used).size !== used.length) throw new Error("File có cột trùng tên. Mỗi cột chỉ được xuất hiện một lần.");
  const columns = [...new Set(used)];
  const data: string[][] = [];
  const lines: number[] = [];
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row.some((v) => v != null && String(v).trim() !== "")) continue;
    if (data.length >= MAX_SHEET_ROWS) throw new Error(`Tối đa ${MAX_SHEET_ROWS} dòng mỗi lần nhập.`);
    data.push(columns.map((key) => {
      const value = row[keys.indexOf(key)];
      if (value == null || String(value).trim() === "") return "";
      const type = TYPES.get(key);
      if (type === "date") return dateValue(value, i + 1);
      // Số (tiền, số lượng, khối lượng, PAO): ô số của Excel giữ nguyên; ô chữ bỏ phân cách nghìn.
      if (type === "money" || type === "whole" || type === "positive") return typeof value === "number" ? String(value) : normalizeNumberText(String(value));
      return String(value).trim();
    }));
    lines.push(i + 1);
  }
  if (data.length === 0) throw new Error(`File chưa có dữ liệu. Điền từ dòng ${headerIndex + 2} trong sheet "${CATALOG_SHEET}" rồi tải lên lại.`);
  return { csv: toCsv([columns, ...data]), lines };
}

export async function readCatalogFile(file: FormDataEntryValue | null) {
  if (!(file instanceof File) || file.size === 0) throw new Error("Chưa chọn file Excel (.xlsx) hoặc CSV.");
  if (file.size > MAX_BYTES) throw new Error("File quá lớn (tối đa 2 MB).");
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "csv") return sheetRowsToCsv(parseCsv(await file.text()));
  if (extension !== "xlsx") throw new Error("Chỉ nhận Excel .xlsx hoặc CSV. Với file .xls cũ, hãy lưu lại thành .xlsx.");
  const bytes = Buffer.from(await file.arrayBuffer());
  let rows: (CellValue | null)[][];
  try {
    rows = await readSheet(bytes, CATALOG_SHEET);
  } catch {
    // File cũ hai sheet (San pham + Ton dau ky) không còn dùng; file khác thì đọc sheet đầu tiên.
    let legacy = false;
    try {
      await readSheet(bytes, "Ton dau ky");
      legacy = true;
    } catch {}
    if (legacy) throw new Error("Đây là file mẫu cũ (hai sheet). Hãy tải file mẫu mới một sheet và chép dữ liệu sang.");
    try {
      rows = await readSheet(bytes);
    } catch {
      throw new Error("Không đọc được file Excel. Hãy tải file mẫu mới và lưu ở định dạng .xlsx.");
    }
  }
  return sheetRowsToCsv(rows);
}
