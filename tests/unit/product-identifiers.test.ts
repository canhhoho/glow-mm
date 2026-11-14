import { describe, expect, it, vi } from "vitest";
import { resolveProductIdentifiers, suggestProductSlug, suggestVariantSku } from "@/lib/product-identifiers";

describe("product identifiers", () => {
  it("suggests ASCII codes for Vietnamese names and a valid fallback for Myanmar", () => {
    expect(suggestProductSlug("Túi Đỏ Dior", "")).toBe("tui-do-dior");
    expect(suggestProductSlug("", "နေကာခရင်မ်")).toBe("product");
    // Tên chỉ có chữ Myanmar: gốc theo thương hiệu (nhập Excel + form tạo SP truyền slug thương hiệu).
    expect(suggestProductSlug("", "နေကာခရင်မ်", "nivea")).toBe("nivea");
    expect(suggestVariantSku("dior-pink-bag", 0)).toBe("DIOR-PINK-BAG-01");
    expect(suggestVariantSku("x".repeat(80), 99).length).toBeLessThanOrEqual(40);
  });

  it("resolves database collisions and reserves manual and automatic SKUs in the same draft", async () => {
    const exists = async (kind: string, value: string) =>
      kind === "slug" ? ["bag", "bag-2"].includes(value) : value === "BAG-01-2";
    const result = await resolveProductIdentifiers({
      slug: "bag", autoSlug: true,
      variants: [
        { sku: "BAG-01", autoSku: true, label: "A" },
        { sku: "BAG-01", autoSku: false, label: "Manual" },
        { sku: "BAG-01", autoSku: true, label: "B" },
      ],
    }, exists);
    expect(result.slug).toBe("bag-3");
    // SKU tự sinh đi theo slug đã đổi (BAG-3-01), không thành "BAG-01-3".
    expect(result.variants.map(v => v.sku)).toEqual(["BAG-3-01", "BAG-01", "BAG-3-01-2"]);
    expect(result.variants[0].label).toBe("A");
  });

  it("does not regenerate existing or manually edited codes, even when automatic flags are set on existing records", async () => {
    const exists = vi.fn(async () => true);
    const input = { id: "old-product", slug: "old-url", autoSlug: true, variants: [{ id: "old-variant", sku: "OLD-01", autoSku: true }] };
    expect(await resolveProductIdentifiers(input, exists)).toEqual(input);
    const manual = { slug: "my-url", variants: [{ sku: "MY-SKU" }] };
    expect(await resolveProductIdentifiers(manual, exists)).toEqual(manual);
    expect(exists).not.toHaveBeenCalled();
  });

  it("limits suffixes to the database field lengths and leaves the draft unchanged", async () => {
    const input = { slug: "s".repeat(80), autoSlug: true, variants: [{ sku: "K".repeat(40), autoSku: true }] };
    const result = await resolveProductIdentifiers(input, async (_, value) => !value.endsWith("-2"));
    expect(result.slug).toHaveLength(80);
    expect(result.variants[0].sku).toHaveLength(40);
    expect(input.slug).toBe("s".repeat(80));
    expect(input.variants[0].sku).toBe("K".repeat(40));
  });

  it("rejects repeated manual SKUs instead of overwriting one variant with another", async () => {
    await expect(resolveProductIdentifiers({ slug: "bag", variants: [{ sku: "DUP" }, { sku: "DUP" }] }, async () => false)).rejects.toThrow("bị lặp");
  });
});
