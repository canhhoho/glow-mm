import { describe, expect, it } from "vitest";
import { wouldCreateCycle } from "@/server/affiliates/tree";

describe("Cây CTV (P11)", () => {
  // A ← B ← C (A là cấp trên của B, B của C); D độc lập.
  const parentOf = new Map<string, string | null>([
    ["A", null],
    ["B", "A"],
    ["C", "B"],
    ["D", null],
  ]);

  it("không được chọn chính mình hoặc tuyến dưới (kể cả gián tiếp) làm cấp trên", () => {
    expect(wouldCreateCycle("A", "A", parentOf)).toBe(true);
    expect(wouldCreateCycle("A", "B", parentOf)).toBe(true);
    expect(wouldCreateCycle("A", "C", parentOf)).toBe(true);
  });

  it("chọn người ngoài nhánh hoặc cấp trên → hợp lệ", () => {
    expect(wouldCreateCycle("C", "D", parentOf)).toBe(false);
    expect(wouldCreateCycle("C", "A", parentOf)).toBe(false);
    expect(wouldCreateCycle("D", "C", parentOf)).toBe(false);
  });

  it("dữ liệu đã có vòng → dừng, coi như vòng", () => {
    const broken = new Map<string, string | null>([
      ["X", "Y"],
      ["Y", "X"],
    ]);
    expect(wouldCreateCycle("Z", "X", broken)).toBe(true);
  });
});
