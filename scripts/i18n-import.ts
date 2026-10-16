// Nhập lại cột `my` từ CSV đã duyệt vào messages/*.my.json.
// Chạy: npm run i18n:import -- file.csv
// Có lỗi (key lạ, thiếu/thừa biến {..}) → không ghi gì, in danh sách lỗi.
import { readFileSync, writeFileSync } from "node:fs";
import { applyImport, parseCsv, type ExportInput, type ReviewList } from "@/lib/i18n-csv";

const file = process.argv[2];
if (!file) {
  console.error("Cách dùng: npm run i18n:import -- <file.csv>");
  process.exit(1);
}
const read = (f: string) => JSON.parse(readFileSync(`messages/${f}`, "utf8"));
const write = (f: string, data: unknown) => writeFileSync(`messages/${f}`, JSON.stringify(data, null, 2) + "\n");

const files: ExportInput = {
  store: { en: read("store.en.json"), my: read("store.my.json") },
  admin: { en: read("admin.en.json"), my: read("admin.my.json") },
};
const review: ReviewList = read("review-my.json");
const result = applyImport(parseCsv(readFileSync(file, "utf8")), files, review);

if (result.errors.length > 0) {
  console.error(`Không ghi gì — ${result.errors.length} lỗi:`);
  for (const e of result.errors) console.error(`  ${e}`);
  process.exit(1);
}
write("store.my.json", result.my.store);
write("admin.my.json", result.my.admin);
write("review-my.json", result.review);
const left = result.review.store.length + result.review.admin.length;
console.log(`Đã cập nhật ${result.updated} chuỗi tiếng Myanmar. Còn ${left} chuỗi cần duyệt.`);
