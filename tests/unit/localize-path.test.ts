import { describe, expect, it } from "vitest";
import { extractLocaleAndRest, switchLocaleInPath } from "@/lib/localize-path";

describe("E2: localize-path", () => {
  describe("extractLocaleAndRest", () => {
    it("nhận diện đúng tiền tố locale hợp lệ", () => {
      expect(extractLocaleAndRest("/en/checkout")).toEqual({ locale: "en", rest: "/checkout" });
      expect(extractLocaleAndRest("/vi/p/abc")).toEqual({ locale: "vi", rest: "/p/abc" });
      expect(extractLocaleAndRest("/my/account")).toEqual({ locale: "my", rest: "/account" });
      expect(extractLocaleAndRest("/en")).toEqual({ locale: "en", rest: "/" });
      expect(extractLocaleAndRest("/vi/")).toEqual({ locale: "vi", rest: "/" });
    });

    it("không nhầm lẫn từ bắt đầu bằng chữ cái trùng locale", () => {
      expect(extractLocaleAndRest("/enterprise")).toEqual({ locale: null, rest: "/enterprise" });
      expect(extractLocaleAndRest("/view")).toEqual({ locale: null, rest: "/view" });
      expect(extractLocaleAndRest("/mystore/items")).toEqual({ locale: null, rest: "/mystore/items" });
    });
  });

  describe("switchLocaleInPath", () => {
    it("đổi từ tiếng Myanmar mặc định sang EN và VI", () => {
      expect(switchLocaleInPath("/checkout", "en")).toBe("/en/checkout");
      expect(switchLocaleInPath("/checkout", "vi")).toBe("/vi/checkout");
      expect(switchLocaleInPath("/checkout", "my")).toBe("/checkout");
    });

    it("đổi từ EN sang Myanmar và VI", () => {
      expect(switchLocaleInPath("/en/checkout", "my")).toBe("/checkout");
      expect(switchLocaleInPath("/en/checkout", "vi")).toBe("/vi/checkout");
      expect(switchLocaleInPath("/en/checkout", "en")).toBe("/en/checkout");
    });

    it("đổi từ VI sang EN và Myanmar", () => {
      expect(switchLocaleInPath("/vi/account", "en")).toBe("/en/account");
      expect(switchLocaleInPath("/vi/account", "my")).toBe("/account");
    });

    it("giữ nguyên query params và hash", () => {
      expect(switchLocaleInPath("/checkout?step=2#pay", "en")).toBe("/en/checkout?step=2#pay");
      expect(switchLocaleInPath("/en/p/serum?sku=123#reviews", "my")).toBe("/p/serum?sku=123#reviews");
    });

    it("xử lý trang chủ /", () => {
      expect(switchLocaleInPath("/", "en")).toBe("/en");
      expect(switchLocaleInPath("/en", "my")).toBe("/");
      expect(switchLocaleInPath("/vi", "en")).toBe("/en");
    });

    it("bảo toàn các đường dẫn có chữ trùng locale", () => {
      expect(switchLocaleInPath("/enterprise", "en")).toBe("/en/enterprise");
      expect(switchLocaleInPath("/en/enterprise", "my")).toBe("/enterprise");
      expect(switchLocaleInPath("/view", "en")).toBe("/en/view");
    });

    it("chặn toàn bộ đầu vào độc hại (open redirect, ký tự lạ)", () => {
      // Protocol-relative
      expect(switchLocaleInPath("//evil.com", "en")).toBeNull();
      expect(switchLocaleInPath("//evil.com/checkout", "en")).toBeNull();
      // Backslash
      expect(switchLocaleInPath("/\\evil.com", "en")).toBeNull();
      // Absolute URL
      expect(switchLocaleInPath("https://evil.com", "en")).toBeNull();
      expect(switchLocaleInPath("http://evil.com/checkout", "en")).toBeNull();
      // Javascript URI
      expect(switchLocaleInPath("javascript:alert(1)", "en")).toBeNull();
      // Ký tự điều khiển (tab, newline)
      expect(switchLocaleInPath("/\t/evil.com", "en")).toBeNull();
      expect(switchLocaleInPath("/\n/evil.com", "en")).toBeNull();
      // Chuỗi rỗng hoặc không bắt đầu bằng /
      expect(switchLocaleInPath("", "en")).toBeNull();
      expect(switchLocaleInPath("checkout", "en")).toBeNull();
    });
  });
});
