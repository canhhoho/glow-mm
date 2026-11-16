import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Chặn tạo thêm đường ghi riêng cho nghiệp vụ rủi ro cao (docs/ban-do-nghiep-vu-admin.md §3–4).
 * Mỗi mẫu chỉ được xuất hiện trong các file liệt kê; cần nơi mới → gọi hàm domain sẵn có.
 */
const root = path.resolve(import.meta.dirname, "../..");
const serverFiles = (dir = path.join(root, "src/server")): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? serverFiles(p) : /\.tsx?$/.test(e.name) ? [p] : [];
  });
const rel = (p: string) => path.relative(root, p).replaceAll("\\", "/");

const RULES: { what: string; pattern: RegExp; allowed: string[] }[] = [
  // R6: phiếu kho chỉ tạo ở documents.ts (createDocument / postOrderDocumentTx) → luôn ghi sổ qua postDocumentTx.
  { what: "tạo phiếu kho", pattern: /\.stockDocument\.create(Many)?\(/, allowed: ["src/server/inventory/documents.ts"] },
  // Tồn kho chỉ đổi qua applyMoves (ledger.ts ghi bằng SQL thô, nên mẫu Prisma không được xuất hiện ở đâu khác).
  { what: "ghi StockBalance", pattern: /\.stockBalance\.(create|update|upsert|delete)(Many)?\(/, allowed: ["src/server/inventory/ledger.ts"] },
  // R1: lịch sử giá chỉ ghi ở price-write.ts (writeLivePrice / recordPriceChange).
  { what: "ghi PriceHistory", pattern: /\.priceHistory\.create(Many)?\(/, allowed: ["src/server/catalog/price-write.ts"] },
];

describe("Một đường ghi cho nghiệp vụ giá / kho", () => {
  const files = serverFiles().map((p) => ({ file: rel(p), text: readFileSync(p, "utf8") }));
  for (const r of RULES) {
    it(`${r.what} chỉ ở ${r.allowed.join(", ")}`, () => {
      expect(files.filter((f) => r.pattern.test(f.text) && !r.allowed.includes(f.file)).map((f) => f.file)).toEqual([]);
    });
  }
});
