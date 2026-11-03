import "server-only";
import { readSheet, type CellValue } from "read-excel-file/node";
import definitions from "@/lib/catalog-import-columns.json";
import { toCsv } from "@/lib/csv";

export type ImportKind = "products" | "stock";
const SHEETS = { products: "San pham", stock: "Ton dau ky" };
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 5000;

function headerKey(value: CellValue | null | undefined, kind: ImportKind) {
  if (typeof value !== "string") return "";
  const parts = value.normalize("NFC").toLowerCase().split(/\r?\n/).map((s) => s.replace(/\*/g, "").trim());
  return definitions[kind].find((c) => parts.includes(c.key) || parts.includes(c.label.toLowerCase()))?.key ?? "";
}

function dateValue(value: CellValue, line: number, label: string): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  const local = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  const iso = local ? `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}` : text;
  const date = new Date(`${iso}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== iso) {
    throw new Error(`Dòng ${line}, ${label}: nhập ngày theo dd/mm/yyyy, ví dụ 31/03/2028.`);
  }
  return iso;
}

/** Read only the input table, ignoring titles, instructions and empty formatted rows. */
export function importSheetToCsv(rows: (CellValue | null)[][], kind: ImportKind) {
  const columns = definitions[kind];
  const required = columns.filter((c) => c.required);
  const headerIndex = rows.slice(0, 20).findIndex((r) => {
    const keys = r.map((v) => headerKey(v, kind));
    return required.every((c) => keys.includes(c.key));
  });
  if (headerIndex < 0) throw new Error(`Không tìm thấy đủ cột bắt buộc. Hãy dùng file mẫu ${SHEETS[kind]} và giữ nguyên hàng tiêu đề.`);
  const keys = rows[headerIndex].map((v) => headerKey(v, kind));
  const recognized = keys.filter(Boolean);
  if (new Set(recognized).size !== recognized.length) throw new Error("File có cột trùng tên. Mỗi cột chỉ được xuất hiện một lần.");
  const data: string[][] = [];
  const lineNumbers: number[] = [];
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row.some((v) => v != null && String(v).trim() !== "")) continue;
    if (data.length >= MAX_ROWS) throw new Error(`Tối đa ${MAX_ROWS} dòng dữ liệu mỗi lần nhập.`);
    data.push(columns.map((column) => {
      const index = keys.indexOf(column.key);
      const value = index < 0 ? null : row[index];
      if (value == null || String(value).trim() === "") return "";
      return column.type === "date" ? dateValue(value, i + 1, column.label) : String(value).trim();
    }));
    lineNumbers.push(i + 1);
  }
  if (data.length === 0) throw new Error("File chưa có dữ liệu. Điền thông tin từ dòng 7 trong sheet nhập liệu rồi tải lên lại.");
  return { csv: toCsv([columns.map((c) => c.key), ...data]), lineNumbers };
}

export async function readImportFile(file: FormDataEntryValue | null, kind: ImportKind) {
  if (!(file instanceof File) || file.size === 0) throw new Error("Chưa chọn file Excel (.xlsx) hoặc CSV.");
  if (file.size > MAX_BYTES) throw new Error("File quá lớn (tối đa 2 MB).");
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "csv") return { csv: await file.text(), lineNumbers: undefined };
  if (extension !== "xlsx") throw new Error("Chỉ nhận Excel .xlsx hoặc CSV. Với file .xls cũ, hãy lưu lại thành .xlsx.");
  let rows;
  try {
    rows = await readSheet(Buffer.from(await file.arrayBuffer()), SHEETS[kind]);
  } catch {
    throw new Error(`Không đọc được file Excel hoặc thiếu sheet ${SHEETS[kind]}. Hãy tải file mẫu mới và lưu ở định dạng .xlsx.`);
  }
  return importSheetToCsv(rows, kind);
}
