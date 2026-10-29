import { describe, expect, it } from "vitest";
import { clientIp } from "@/lib/client-ip";

describe("clientIp (P19)", () => {
  it("ưu tiên x-real-ip do proxy đặt", () => {
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.5", "x-forwarded-for": "1.1.1.1, 203.0.113.5" }))).toBe("203.0.113.5");
  });

  it("x-forwarded-for: lấy phần tử cuối (proxy thêm), bỏ giá trị client tự khai ở đầu", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "9.9.9.9, 198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientIp(new Headers({ "x-forwarded-for": " 198.51.100.7 " }))).toBe("198.51.100.7");
  });

  it("không có header → chuỗi rỗng", () => {
    expect(clientIp(new Headers())).toBe("");
  });
});
