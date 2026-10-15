import Rabbit from "rabbit-node";
import { describe, expect, it } from "vitest";
import { hasMyanmar, isZawgyi, normalizeForSearch, searchVariants, toUnicode } from "@/lib/myanmar";

const UNICODE = ["ကျောင်း", "နေကာခရင်မ်", "မျက်နှာသစ်", "ပစ္စည်းရောက်မှ ငွေချေ", "အသားအရေ"];

describe("Zawgyi → Unicode", () => {
  it("nhận diện Zawgyi và chuyển đúng về Unicode", () => {
    for (const u of UNICODE) {
      const zg = Rabbit.uni2zg(u);
      expect(isZawgyi(zg)).toBe(true);
      expect(toUnicode(zg)).toBe(u);
    }
  });

  it("giữ nguyên chuỗi đã là Unicode", () => {
    for (const u of UNICODE) {
      expect(isZawgyi(u)).toBe(false);
      expect(toUnicode(u)).toBe(u);
    }
  });

  it("không đụng vào chữ Latin", () => {
    expect(hasMyanmar("Sunscreen SPF50")).toBe(false);
    expect(toUnicode("Sunscreen SPF50")).toBe("Sunscreen SPF50");
    expect(normalizeForSearch("  Sunscreen   SPF50 ")).toBe("sunscreen spf50");
  });

  it("truy vấn ngắn mơ hồ → tìm cả hai dạng", () => {
    const zg = Rabbit.uni2zg("မင်္ဂလာပါ");
    const variants = searchVariants(zg);
    expect(variants).toContain("မင်္ဂလာပါ");
  });
});
