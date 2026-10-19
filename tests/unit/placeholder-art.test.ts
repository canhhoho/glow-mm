import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { bannerSvg, escapeXml, hueOf, iconSvg, productSvg, toWebp, wrapText } from "../../scripts/lib/placeholder-art";
import { sniffImageMime } from "@/server/files/public-images";

describe("ảnh minh hoạ tự vẽ (bản Preview)", () => {
  it("escape ký tự XML trong tên SP", () => {
    expect(escapeXml(`Tone Up & "Glow" <50ml>`)).toBe("Tone Up &amp; &quot;Glow&quot; &lt;50ml&gt;");
    const svg = productSvg({ brand: "B&B", name: "Sun <Milk>", label: "50ml", hue: 10 });
    expect(svg).toContain("B&amp;B");
    expect(svg).not.toMatch(/<Milk>/);
  });

  it("ngắt dòng theo từ, cắt bằng … khi quá số dòng hoặc từ quá dài", () => {
    expect(wrapText("Perfect UV Sunscreen Skincare Milk", 12, 3)).toEqual(["Perfect UV", "Sunscreen", "Skincare…"]);
    expect(wrapText("Short", 12, 2)).toEqual(["Short"]);
    expect(wrapText("Supercalifragilistic", 8, 2)).toEqual(["Superca…"]);
    for (const l of wrapText("a b c d e f g h i j k l m n o p", 5, 2)) expect(l.length).toBeLessThanOrEqual(5);
  });

  it("màu ổn định theo slug, trong khoảng 0–359", () => {
    expect(hueOf("anessa-milk")).toBe(hueOf("anessa-milk"));
    expect(hueOf("anessa-milk")).not.toBe(hueOf("anua-serum"));
    expect(hueOf("x")).toBeGreaterThanOrEqual(0);
    expect(hueOf("x")).toBeLessThan(360);
  });

  it("chuyển ra WebP đúng kích thước, qua được kiểm tra ảnh upload (magic bytes)", async () => {
    const cases = [
      { svg: productSvg({ brand: "Anessa", name: "Perfect UV Sunscreen Skincare Milk SPF50+", label: "60ml", hue: 20 }), w: 800, h: 800 },
      { svg: bannerSvg({ title: "Glow VN", subtitle: "Mỹ phẩm Việt Nam", w: 1500, h: 500, hue: 350 }), w: 1500, h: 500 },
      { svg: bannerSvg({ title: "Glow VN", subtitle: "Demo", w: 750, h: 500, hue: 350 }), w: 750, h: 500 },
      { svg: iconSvg({ letter: "skincare", hue: 120 }), w: 256, h: 256 },
    ];
    for (const c of cases) {
      const webp = await toWebp(c.svg);
      expect(sniffImageMime(webp)).toBe("image/webp");
      const meta = await sharp(webp).metadata();
      expect([meta.width, meta.height]).toEqual([c.w, c.h]);
    }
  });
});
