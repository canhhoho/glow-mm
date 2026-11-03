import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const xml = (s: string) => {
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(s)) throw new Error("Thông tin đơn chứa ký tự điều khiển không hợp lệ trong Excel.");
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
};

/** Replace only A:U data rows. Preserve vendor headers, styles, hidden lists and validation XML byte-for-byte. */
export function fillVtpTemplate(template: Uint8Array, rows: (string | number)[][]): Uint8Array {
  if (rows.length === 0 || rows.length > 200 || rows.some((r) => r.length !== 21)) throw new Error("Chọn từ 1 đến 200 đơn; mỗi đơn cần đủ 21 cột VTP.");
  const files = unzipSync(template);
  const sheetPath = "xl/worksheets/sheet1.xml";
  const original = strFromU8(files[sheetPath]);
  const sample = original.match(/<row\b[^>]*\br="8"[^>]*>[\s\S]*?<\/row>/)?.[0];
  if (!sample) throw new Error("Mẫu VTP thiếu dòng mẫu số 8.");
  const styles = [...sample.matchAll(/<c\b([^>]*)\br="([A-U])8"([^>]*)>/g)].map((m) => ({ col: m[2], style: /\bs="(\d+)"/.exec(m[1] + m[3])?.[1] }));
  const generated = rows.map((values, i) => {
    const row = i + 8;
    const cells = values.map((value, j) => {
      const column = String.fromCharCode(65 + j);
      // The vendor's note style does not wrap; reuse its matching wrapped text style.
      const style = styles.find((s) => s.col === (column === "U" ? "B" : column))?.style;
      const attrs = `r="${column}${row}"${style ? ` s="${style}"` : ""}`;
      if (typeof value === "number") {
        if (!Number.isFinite(value)) throw new Error("Số liệu Excel không hợp lệ.");
        return `<c ${attrs}><v>${value}</v></c>`;
      }
      // Inline text protects phones, leading zeroes and strings beginning with '=' from formula evaluation.
      return `<c ${attrs} t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
    }).join("");
    const lines = Math.max(String(values[20]).length / 24, String(values[8]).length / 26, String(values[7]).length / 40);
    const height = Math.max(30, Math.min(150, Math.ceil(lines) * 15));
    return `<row r="${row}" ht="${height}" customHeight="1">${cells}</row>`;
  }).join("");
  const data = /<sheetData>([\s\S]*?)<\/sheetData>/.exec(original);
  if (!data) throw new Error("Mẫu VTP không có vùng dữ liệu.");
  const headers = (data[1].match(/<row\b[^>]*(?:\/>|>[\s\S]*?<\/row>)/g) ?? []).filter((r) => Number(/\br="(\d+)"/.exec(r)?.[1]) < 8).join("");
  files[sheetPath] = strToU8(original.replace(data[0], `<sheetData>${headers}${generated}</sheetData>`));
  // The template's calc chain points to its old row-number formulas, which are replaced with numeric serials.
  delete files["xl/calcChain.xml"];
  for (const name of ["xl/_rels/workbook.xml.rels", "[Content_Types].xml"]) {
    files[name] = strToU8(strFromU8(files[name]).replace(/<Relationship\b[^>]*Type="[^"]*\/calcChain"[^>]*\/>/g, "").replace(/<Override\b[^>]*PartName="\/xl\/calcChain.xml"[^>]*\/>/g, ""));
  }
  return zipSync(files, { level: 6 });
}

export async function createVtpWorkbook(rows: (string | number)[][]) {
  const template = await readFile(path.join(process.cwd(), "src/server/orders/templates/vtp-myanmar.xlsx"));
  return fillVtpTemplate(template, rows);
}
