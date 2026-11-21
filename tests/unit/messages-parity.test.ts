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

  it("C1: các câu đặt trước thể hiện thời gian dự kiến 1–2 tuần ở 3 ngôn ngữ", () => {
    const preorderKeys = [
      (d: typeof vi) => d.Product.preorderNote,
      (d: typeof vi) => d.Cart.preorderLine,
      (d: typeof vi) => d.Cart.preorderNotice,
      (d: typeof vi) => d.Checkout.preorderNotice,
      (d: typeof vi) => d.Order.preorderInfo,
    ];

    for (const getter of preorderKeys) {
      expect(getter(vi)).toMatch(/1[–-]2 tuần/);
      expect(getter(en)).toMatch(/1[–-]2 weeks/);
      expect(getter(my)).toMatch(/[၁1][–-][၂2] ပတ်/);
    }
  });

  it("D1: Address.shippingNote và Info.shipping nói rõ nguyên tắc trả ship cho hãng vận chuyển", () => {
    // VI
    expect(vi.Address.shippingNote).toMatch(/hãng vận chuyển/);
    expect(vi.Info.shipping.body[0]).toMatch(/trực tiếp cho hãng vận chuyển/);

    // EN
    expect(en.Address.shippingNote).toMatch(/directly to the courier/i);
    expect(en.Info.shipping.body[0]).toMatch(/directly to the courier/i);

    // MY
    expect(my.Address.shippingNote).toMatch(/တိုက်ရိုက်ပေးချေ/);
    expect(my.Info.shipping.body[0]).toMatch(/တိုက်ရိုက်ပေးချေ/);
  });
});
