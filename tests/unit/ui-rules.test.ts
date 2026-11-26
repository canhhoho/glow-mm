import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Chặn hardcode giao diện theo docs/design-system.md §3–§4 (để mọi người/AI agent cùng một chuẩn).
 * Ngoại lệ có chủ ý: SVG biểu đồ (charts.tsx), trang in (admin/(print)).
 */
const ROOT = join(__dirname, "../../src");
const ALLOW = [/components[\\/]admin[\\/]charts\.tsx$/, /app[\\/]admin[\\/]\(print\)[\\/]/];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

const files = walk(ROOT).filter((f) => !ALLOW.some((re) => re.test(f)));

const RULES: { name: string; re: RegExp }[] = [
  { name: "màu palette Tailwind thô (dùng token: success/warning/danger/primary…)", re: /\b(?:bg|text|border|ring|from|to|via|fill|stroke|outline|divide|accent|decoration)-(?:red|gray|slate|zinc|neutral|stone|emerald|green|amber|yellow|orange|blue|sky|indigo|violet|purple|pink|rose|teal|cyan|lime|fuchsia)-\d{2,3}\b/ },
  { name: "mã màu hex trong class (dùng token trong globals.css)", re: /-\[#[0-9a-fA-F]{3,8}\]/ },
  { name: "cỡ chữ tuỳ ý text-[Npx] (dùng text-2xs/xs/sm…)", re: /\btext-\[\d+(?:\.\d+)?(?:px|rem)\]/ },
  { name: "text-brand cho chữ (tương phản thấp — dùng text-primary / text-brand-dark)", re: /\btext-brand(?![-\w])/ },
  { name: "class brand-dark (một tên màu nhấn: dùng primary)", re: /\b(?:bg|text|border|ring|fill|stroke|outline|decoration)-brand-dark\b/ },
  { name: "ui/input, ui/label của shadcn (lệch chiều cao — dùng FIELD + Field)", re: /from "@\/components\/ui\/(?:input|label)"/ },
];

describe("quy tắc UI (design-system)", () => {
  for (const rule of RULES) {
    it(`không có ${rule.name}`, () => {
      const hits = files.flatMap((f) =>
        readFileSync(f, "utf8")
          .split("\n")
          .flatMap((line, i) => (rule.re.test(line) ? [`${relative(ROOT, f).split(sep).join("/")}:${i + 1}`] : [])),
      );
      // Màn đăng nhập admin còn dùng ui/input + ui/label (form auth, chưa đổi) — chỉ cho phép đúng file này.
      const allowed = rule.name.startsWith("ui/input") ? hits.filter((h) => !h.startsWith("components/admin/login-form.tsx")) : hits;
      expect(allowed).toEqual([]);
    });
  }
});
