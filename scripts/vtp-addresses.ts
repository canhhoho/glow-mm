/**
 * Sinh danh mục địa chỉ VTP Myanmar (P15) từ file thu thập `vtp_myanmar_receiver_address.md`
 * + tên Myanmar nháp `prisma/data/vtp-names-my.json`:
 *   - prisma/data/vtp-myanmar-addresses.json (dữ liệu chuẩn, commit)
 *   - --sql <file>: câu INSERT cho migration (mọi môi trường có dữ liệu sau `prisma migrate deploy`).
 * Dùng: npx tsx scripts/vtp-addresses.ts [--sql prisma/migrations/<tên>/data.sql]
 * Tên Myanmar là bản nháp [CẦN XÁC MINH] — admin sửa được ở /admin/settings/locations.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { districtId, parseVtpMarkdown, stateId, townshipId } from "../src/server/locations/vtp";

const names = JSON.parse(readFileSync("prisma/data/vtp-names-my.json", "utf8")) as Record<string, string>;
const missing = new Set<string>();
const states = parseVtpMarkdown(readFileSync("vtp_myanmar_receiver_address.md", "utf8"), (en) => {
  if (!names[en]) missing.add(en);
  return names[en];
});
if (missing.size) console.warn(`Thiếu tên Myanmar (dùng tên tiếng Anh): ${[...missing].join(", ")}`);

writeFileSync("prisma/data/vtp-myanmar-addresses.json", JSON.stringify(states, null, 2) + "\n");
const districts = states.flatMap((s) => s.districts);
console.log(`${states.length} vùng, ${districts.length} huyện, ${districts.flatMap((d) => d.townships).length} thị trấn`);

const sqlFile = process.argv[process.argv.indexOf("--sql") + 1];
if (process.argv.includes("--sql") && sqlFile) {
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const rows = (table: string, cols: string[], values: string[][]) =>
    `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES\n${values.map((v) => `  (${v.join(", ")})`).join(",\n")};\n`;
  const st: string[][] = [];
  const ds: string[][] = [];
  const tw: string[][] = [];
  states.forEach((s, i) => {
    st.push([q(stateId(s.code)), q(s.code), q(s.nameEn), q(s.nameMy), String(i)]);
    s.districts.forEach((d, j) => {
      ds.push([q(districtId(s.code, d.code)), q(stateId(s.code)), q(d.code), q(d.nameEn), q(d.nameMy), String(j)]);
      d.townships.forEach((t, k) => {
        tw.push([q(townshipId(s.code, d.code, t.code)), q(districtId(s.code, d.code)), q(t.code), q(t.nameEn), q(t.nameMy), String(k)]);
      });
    });
  });
  writeFileSync(
    sqlFile,
    "-- Danh mục địa chỉ VTP Myanmar (sinh bởi scripts/vtp-addresses.ts — không sửa tay).\n" +
      rows("MmState", ["id", "code", "nameEn", "nameMy", "sortOrder"], st) +
      rows("MmDistrict", ["id", "stateId", "code", "nameEn", "nameMy", "sortOrder"], ds) +
      rows("MmTownship", ["id", "districtId", "code", "nameEn", "nameMy", "sortOrder"], tw),
  );
  console.log(`SQL → ${sqlFile}`);
}
