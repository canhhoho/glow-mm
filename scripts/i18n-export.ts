// Xuất toàn bộ chuỗi giao diện ra CSV (mở bằng Excel) để người bản ngữ duyệt tiếng Myanmar.
// Chạy: npm run i18n:export [-- out.csv]   (mặc định: i18n-export.csv ở thư mục gốc, không commit)
import { readFileSync, writeFileSync } from "node:fs";
import { buildExportRows, toCsv, type ExportInput, type ReviewList } from "@/lib/i18n-csv";

const read = (f: string) => JSON.parse(readFileSync(`messages/${f}`, "utf8"));
const files: ExportInput = {
  store: { en: read("store.en.json"), my: read("store.my.json") },
  admin: { en: read("admin.en.json"), my: read("admin.my.json"), vi: read("admin.vi.json") },
};
const review: ReviewList = read("review-my.json");
const out = process.argv[2] ?? "i18n-export.csv";
const rows = buildExportRows(files, review);
writeFileSync(out, toCsv(rows));
const need = rows.filter((r) => r[5] === "x").length;
console.log(`Đã xuất ${rows.length - 1} chuỗi → ${out} (${need} chuỗi cần duyệt, cột review = "x").`);
