import { describe, expect, it } from "vitest";
import { isStandardVariantLabel, STANDARD_VARIANT_LABELS } from "@/lib/variant-label";

describe("nhãn phân loại hệ thống", () => {
  it("nhận nhãn 'một loại tiêu chuẩn' của mọi ngôn ngữ admin, bỏ qua hoa/thường và khoảng trắng", () => {
    expect(STANDARD_VARIANT_LABELS).toContain("Tiêu chuẩn");
    for (const l of STANDARD_VARIANT_LABELS) expect(isStandardVariantLabel(l)).toBe(true);
    expect(isStandardVariantLabel("  tiêu   CHUẨN ")).toBe(true);
  });

  it("tên do người dùng đặt không bị coi là nhãn hệ thống", () => {
    for (const l of ["50ml", "Đỏ", "#01 Rose", "Tiêu chuẩn 50ml", "", null, undefined]) expect(isStandardVariantLabel(l)).toBe(false);
  });
});
