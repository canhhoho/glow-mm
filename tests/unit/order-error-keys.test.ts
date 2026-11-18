import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import adminVi from "../../messages/admin.vi.json";

// Mọi mã OrderError phải có câu `Orders.err.<mã>` (admin + cổng CTV dùng chung `orderErrorText`) — thiếu thì
// next-intl báo MISSING_MESSAGE thay cho câu lỗi. Parity vi/en/my đã có test riêng.
describe("Orders.err đủ mọi mã OrderError", () => {
  it("không thiếu mã nào", () => {
    const src = readFileSync("src/server/orders/errors.ts", "utf8");
    const union = src.slice(src.indexOf("export type OrderErrorCode"), src.indexOf("export class OrderError"));
    const codes = [...union.matchAll(/\| "(\w+)"/g)].map((m) => m[1]);
    expect(codes.length).toBeGreaterThan(10);
    const keys = Object.keys((adminVi as { Orders: { err: Record<string, string> } }).Orders.err);
    expect(codes.filter((c) => !keys.includes(c))).toEqual([]);
  });
});
