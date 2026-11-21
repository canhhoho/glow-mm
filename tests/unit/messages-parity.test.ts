import { describe, expect, it } from "vitest";
import en from "../../messages/store.en.json";
import my from "../../messages/store.my.json";
import vi from "../../messages/store.vi.json";

// Ba file chuỗi storefront phải cùng bộ key (thiếu key → next-intl hiện tên key cho khách).
const keys = (o: object, prefix = ""): string[] =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" && !Array.isArray(v) ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );

describe("messages storefront", () => {
  it("store.{my,en,vi}.json cùng bộ key", () => {
    const base = keys(en).sort();
    expect(keys(my).sort()).toEqual(base);
    expect(keys(vi).sort()).toEqual(base);
  });

  it("B1: không còn câu mâu thuẫn yêu cầu tải biên lai trong store.*.json", () => {
    for (const [, dict] of [["vi", vi], ["en", en], ["my", my]] as const) {
      const json = JSON.stringify(dict);
      expect(json).not.toMatch(/tải ảnh biên lai/i);
      expect(json).not.toMatch(/upload (?:a photo of )?the receipt/i);
      expect(json).not.toMatch(/ပြေစာတင်ပါ/);
      expect(json).not.toMatch(/ပြေစာဓာတ်ပုံ/);
    }
  });
});
