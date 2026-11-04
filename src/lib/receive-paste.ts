/**
 * Dán dữ liệu phiếu nhập từ Excel/Google Sheets (hàm thuần, dùng ở client).
 * Thứ tự cột: SKU, Số lượng, Số lô, Hạn dùng, Giá mua (VND), [Ngày SX], [Loại tồn SELLABLE/TESTER].
 */

export type PastedRow = {
  sku: string;
  qty: number;
  lotNo: string;
  /** yyyy-mm-dd hoặc "" khi bỏ trống. */
  expiryDate: string;
  unitCostVnd: number | null;
  mfgDate: string;
  stockType: "SELLABLE" | "TESTER" | null;
};

export type PasteResult = { rows: PastedRow[]; errors: { line: number; code: PasteErrorCode; value?: string }[] };
export type PasteErrorCode = "sku" | "qty" | "date" | "cost" | "stockType";

function splitLine(line: string): string[] {
  const sep = line.includes("\t") ? "\t" : line.includes(";") ? ";" : ",";
  return line.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, "$1").trim());
}

/** Số nguyên dương/không âm; bỏ dấu phân cách nghìn (90,000 · 90.000 · 90 000). */
export function parseIntLoose(raw: string): number | null {
  const clean = raw.replace(/[\s,.]/g, "");
  if (!/^\d+$/.test(clean)) return null;
  const n = Number(clean);
  return Number.isSafeInteger(n) ? n : null;
}

/** Ngày → yyyy-mm-dd. Nhận yyyy-mm-dd, yyyy/mm/dd, dd/mm/yyyy, d-m-yyyy. Rỗng → "". Sai → null. */
export function parseDateLoose(raw: string): string | null {
  const s = raw.trim();
  if (!s) return "";
  let y: number, m: number, d: number;
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s))) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

/** `skus`: danh sách SKU hợp lệ (so khớp không phân biệt hoa thường; trả về SKU đúng chữ hoa/thường của hệ thống). */
export function parseReceivePaste(text: string, skus: Iterable<string>): PasteResult {
  const bySku = new Map([...skus].map((s) => [s.toUpperCase(), s]));
  const rows: PastedRow[] = [];
  const errors: PasteResult["errors"] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  lines.forEach((rawLine, i) => {
    const line = i + 1;
    if (!rawLine.trim()) return;
    const [skuRaw = "", qtyRaw = "", lotRaw = "", expRaw = "", costRaw = "", mfgRaw = "", typeRaw = ""] = splitLine(rawLine);
    const sku = bySku.get(skuRaw.toUpperCase());
    if (!sku) {
      // Dòng tiêu đề (ô số lượng không phải số) ở đầu → bỏ qua, không báo lỗi.
      if (rows.length === 0 && errors.length === 0 && parseIntLoose(qtyRaw) === null) return;
      errors.push({ line, code: "sku", value: skuRaw });
      return;
    }
    const qty = parseIntLoose(qtyRaw);
    if (qty === null || qty <= 0) return void errors.push({ line, code: "qty", value: qtyRaw });
    const expiryDate = parseDateLoose(expRaw);
    const mfgDate = parseDateLoose(mfgRaw);
    if (expiryDate === null) return void errors.push({ line, code: "date", value: expRaw });
    if (mfgDate === null) return void errors.push({ line, code: "date", value: mfgRaw });
    const unitCostVnd = costRaw ? parseIntLoose(costRaw) : null;
    if (costRaw && unitCostVnd === null) return void errors.push({ line, code: "cost", value: costRaw });
    const st = typeRaw.toUpperCase();
    if (st && st !== "SELLABLE" && st !== "TESTER") return void errors.push({ line, code: "stockType", value: typeRaw });
    rows.push({
      sku,
      qty,
      lotNo: lotRaw,
      expiryDate,
      unitCostVnd,
      mfgDate,
      stockType: st ? (st as "SELLABLE" | "TESTER") : null,
    });
  });
  return { rows, errors };
}
