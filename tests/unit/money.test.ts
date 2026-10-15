import { describe, expect, it } from "vitest";
import { formatMmk, roundUpTo } from "@/lib/money";

describe("money", () => {
  it("làm tròn lên bội số 100 MMK", () => {
    expect(roundUpTo(24_901)).toBe(25_000);
    expect(roundUpTo(25_000)).toBe(25_000);
    expect(roundUpTo(1)).toBe(100);
    expect(roundUpTo(0)).toBe(0);
  });

  it("từ chối step không hợp lệ", () => {
    expect(() => roundUpTo(100, 0)).toThrow();
  });

  it("định dạng MMK theo locale", () => {
    expect(formatMmk(25000, "my")).toBe("25,000 ကျပ်");
    expect(formatMmk(25000, "en")).toBe("25,000 MMK");
  });
});
