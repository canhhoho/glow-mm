import { toUnicode } from "@/lib/myanmar";

/**
 * Xuất/nhập bản dịch qua CSV để người bản ngữ duyệt tiếng Myanmar bằng Excel.
 * - Export: mỗi chuỗi một dòng (file, key, en, vi, my, review). Cột review = "x" nếu key nằm trong danh sách cần duyệt.
 * - Import: chỉ ghi cột `my` cho key đã có; giữ đúng biến ICU ({count}, {name}...); chuyển Zawgyi → Unicode;
 *   dòng có cột review để trống = đã duyệt → bỏ khỏi danh sách.
 */

export type Messages = Record<string, unknown>;
export type MessageFile = "store" | "admin";
export type ReviewList = Record<MessageFile, string[]>;

export const CSV_HEADER = ["file", "key", "en", "vi", "my", "review"] as const;

/** Làm phẳng JSON lồng nhau: `{ a: { b: "x" }, c: ["p","q"] }` → a.b, c.0, c.1. */
export function flatten(obj: unknown, prefix = "", out = new Map<string, string>()): Map<string, string> {
  if (typeof obj === "string") out.set(prefix, obj);
  else if (Array.isArray(obj)) obj.forEach((v, i) => flatten(v, prefix ? `${prefix}.${i}` : String(i), out));
  else if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}

/** Ghi giá trị vào key đã có (chuỗi) trong JSON lồng nhau; key không có → false. */
export function setExisting(obj: Messages, key: string, value: string): boolean {
  const parts = key.split(".");
  let cur: unknown = obj;
  for (const p of parts.slice(0, -1)) {
    if (!cur || typeof cur !== "object") return false;
    cur = (cur as Record<string, unknown>)[p];
  }
  const last = parts[parts.length - 1];
  if (!cur || typeof cur !== "object" || typeof (cur as Record<string, unknown>)[last] !== "string") return false;
  (cur as Record<string, unknown>)[last] = value;
  return true;
}

/** Tên biến ICU trong chuỗi (`{count}`, `{n, plural, ...}` → count, n). */
export function placeholders(s: string): string[] {
  return [...new Set([...s.matchAll(/\{\s*([A-Za-z_]\w*)/g)].map((m) => m[1]))].sort();
}

function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** CSV UTF-8 có BOM + CRLF để Excel mở đúng chữ Myanmar/Việt. */
export function toCsv(rows: string[][]): string {
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Đọc CSV (RFC 4180: ô trong ngoặc kép, "" là dấu nháy, xuống dòng trong ô). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export type ExportInput = Record<MessageFile, { en: Messages; my: Messages; vi?: Messages }>;

export function buildExportRows(files: ExportInput, review: ReviewList): string[][] {
  const rows: string[][] = [[...CSV_HEADER]];
  for (const file of Object.keys(files) as MessageFile[]) {
    const en = flatten(files[file].en);
    const my = flatten(files[file].my);
    const vi = files[file].vi ? flatten(files[file].vi) : new Map<string, string>();
    const need = new Set(review[file] ?? []);
    for (const [key, enValue] of en) {
      rows.push([file, key, enValue, vi.get(key) ?? "", my.get(key) ?? "", need.has(key) ? "x" : ""]);
    }
  }
  return rows;
}

export type ImportResult = { updated: number; errors: string[]; my: Record<MessageFile, Messages>; review: ReviewList };

/**
 * Áp cột `my` từ CSV vào bản sao messages my. Có lỗi thì nơi gọi KHÔNG ghi file.
 * Dòng có ô `my` trống được bỏ qua (giữ bản cũ).
 */
export function applyImport(rows: string[][], files: ExportInput, review: ReviewList): ImportResult {
  const [header, ...body] = rows;
  const col = (name: string) => header?.findIndex((h) => h.trim().toLowerCase() === name) ?? -1;
  const [iFile, iKey, iMy, iReview] = ["file", "key", "my", "review"].map(col);
  const errors: string[] = [];
  if (iFile < 0 || iKey < 0 || iMy < 0) {
    return { updated: 0, errors: ["Thiếu cột file / key / my trong dòng tiêu đề"], my: { store: {}, admin: {} }, review };
  }
  const my = structuredClone({ store: files.store.my, admin: files.admin.my }) as Record<MessageFile, Messages>;
  const nextReview: ReviewList = { store: [...(review.store ?? [])], admin: [...(review.admin ?? [])] };
  let updated = 0;
  body.forEach((r, idx) => {
    const line = idx + 2;
    const file = r[iFile]?.trim() as MessageFile;
    const key = r[iKey]?.trim() ?? "";
    const raw = r[iMy]?.trim() ?? "";
    if (file !== "store" && file !== "admin") return void errors.push(`Dòng ${line}: file "${r[iFile]}" không hợp lệ`);
    const en = flatten(files[file].en).get(key);
    if (en === undefined) return void errors.push(`Dòng ${line}: key "${file}:${key}" không tồn tại`);
    if (!raw) return;
    const value = toUnicode(raw);
    const want = placeholders(en).join(",");
    const got = placeholders(value).join(",");
    if (want !== got) return void errors.push(`Dòng ${line}: ${file}:${key} cần biến {${want}} nhưng bản dịch có {${got}}`);
    if (!setExisting(my[file], key, value)) return void errors.push(`Dòng ${line}: ${file}:${key} không có trong bản my`);
    updated++;
    if (iReview >= 0 && !(r[iReview] ?? "").trim()) nextReview[file] = nextReview[file].filter((k) => k !== key);
  });
  return { updated, errors, my, review: nextReview };
}
