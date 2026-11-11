import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getProductForEdit } from "@/server/catalog/admin-queries";
import { saveProductPricing } from "@/server/catalog/product-pricing";
import { saveProduct } from "@/server/catalog/products";
import { loadReadiness } from "@/server/catalog/readiness";
import { createRate } from "@/server/pricing/runs";
import { makeFixture, markApproved, unpublishTestProducts } from "./fixtures";

afterAll(unpublishTestProducts);

// P1-D: nhãn loại trùng, slug / SKU trùng báo rõ, khoá slug sau lần đăng đầu, cảnh báo tỷ giá mới hơn giá.

const form = async (id: string) => (await getProductForEdit(id))!;

describe("Kiểm tra dữ liệu SP (P1-D)", () => {
  it("nhãn loại trùng (không phân biệt hoa thường) bị chặn", async () => {
    const f = await makeFixture();
    const p = await form(f.productId);
    const dup = { ...p, slug: `it-${f.tag.toLowerCase()}`, variants: [...p.variants, { ...p.variants[0], id: "", sku: `IT-${f.tag}-2`, label: " 50ML " }] };
    await expect(saveProduct(dup, f.userId)).rejects.toThrow(/bị trùng/);
  });

  it("slug / SKU đã dùng ở SP khác → báo rõ, không lỗi ràng buộc DB", async () => {
    const f = await makeFixture();
    const g = await makeFixture();
    await prisma.product.update({ where: { id: g.productId }, data: { slug: `it-${g.tag.toLowerCase()}` } });
    const p = await form(f.productId);
    await expect(saveProduct({ ...p, slug: `it-${g.tag.toLowerCase()}` }, f.userId)).rejects.toThrow(/đã được sản phẩm khác dùng/);
    await expect(saveProduct({ ...p, slug: `it-${f.tag.toLowerCase()}`, variants: [{ ...p.variants[0], sku: `IT-${g.tag}` }] }, f.userId)).rejects.toThrow(/đã được dùng/);
  });

  it("slug khoá sau lần đăng bán đầu tiên", async () => {
    const f = await makeFixture();
    const slug = `it-${f.tag.toLowerCase()}`;
    await prisma.product.update({ where: { id: f.productId }, data: { slug } });
    const p = await form(f.productId);
    await saveProduct({ ...p, slug: `${slug}-moi` }, f.userId); // chưa từng đăng → đổi được
    await markApproved(f.productId, { published: true });
    await prisma.product.update({ where: { id: f.productId }, data: { firstPublishedAt: new Date() } });
    const q = await form(f.productId);
    await expect(saveProduct({ ...q, slug }, f.userId)).rejects.toThrow(/đã khoá/);
  });

  it("RATE_NEWER: có tỷ giá mới hơn lần đổi giá gần nhất (kho nhập VN) → cảnh báo; đặt lại giá → hết", async () => {
    const f = await makeFixture();
    const warn = async () => (await loadReadiness(prisma, [f.productId])).get(f.productId)!.warnings.find((w) => w.code === "RATE_NEWER");
    expect(await warn()).toBeUndefined(); // chưa có lịch sử giá → không đoán
    await saveProductPricing({ productId: f.productId, reason: "đặt giá", variants: [{ id: f.variantId, priceMmk: 20_000 }] }, f.userId);
    expect(await warn()).toBeUndefined();
    await createRate({ mmkPerUsd: "2700", vndPerUsd: "26000" }, f.userId);
    expect(await warn()).toEqual({ code: "RATE_NEWER", skus: [`IT-${f.tag}`] });
    await saveProductPricing({ productId: f.productId, reason: "tỷ giá mới", variants: [{ id: f.variantId, priceMmk: 21_000 }] }, f.userId);
    expect(await warn()).toBeUndefined();
  });
});
