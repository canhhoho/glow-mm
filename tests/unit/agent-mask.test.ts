import { describe, expect, it } from "vitest";
import { customerText, maskName, maskPhone } from "@/server/agent/mask";

// P25 gói B2: thông tin khách trả cho trợ lý AI phải được ẩn (chủ shop chọn A, 25/11/2026).
describe("ẩn thông tin khách cho agent", () => {
  it("tên: giữ danh xưng, mỗi từ khác chỉ giữ ký tự đầu", () => {
    expect(maskName("Ma Hla Hla")).toBe("Ma H*** H***");
    expect(maskName("U Aung Kyaw")).toBe("U A*** K***");
    expect(maskName("Thida")).toBe("T***");
    expect(maskName("ဒေါ် မြင့်မြင့်")).toBe("ဒေါ် မ***");
    expect(maskName("  ")).toBe("");
    expect(maskName(null)).toBe("");
  });

  it("SĐT: chỉ giữ 2 số đầu + 3 số cuối", () => {
    expect(maskPhone("0978123456")).toBe("09•••••456");
    expect(maskPhone("09781234567")).toBe("09••••••567");
    expect(maskPhone("0978123456")).not.toContain("78123");
    expect(maskPhone("123")).toBe("•••");
    expect(maskPhone(null)).toBeNull();
  });

  it("ghi chú khách: cắt ngắn, rỗng → null", () => {
    expect(customerText("  ")).toBeNull();
    expect(customerText("abc")).toBe("abc");
    const long = customerText("x".repeat(300))!;
    expect(Array.from(long)).toHaveLength(201);
    expect(long.endsWith("…")).toBe(true);
  });
});
