import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createDocument, postDocument } from "@/server/inventory/documents";
import { loadReadiness } from "@/server/catalog/readiness";
import { saveProduct, setProductsPublished } from "@/server/catalog/products";
import { makeFixture, unpublishTestProducts, type Fixture } from "./fixtures";

afterAll(unpublishTestProducts);

const product = (f: Fixture, slug: string, variant: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  slug,
  brandId: f.brandId,
  categoryId: f.categoryId,
  stockLocationId: f.mm.id,
  my: { name: "SP", description: "d", usage: "u" },
  en: { name: "SP", description: "d", usage: "u" },
  variants: [{ label: "x", ...variant }],
  ...extra,
});

describe("Sẵn sàng mở bán (D2)", () => {
  it("bật hiển thị khi lưu: thiếu khối lượng / giá 0 bị chặn, không ghi gì; đủ thì bật được dù thiếu ảnh (chỉ cảnh báo)", async () => {
    const f = await makeFixture();
    const slug = `rd-${f.tag.toLowerCase()}`;
    await expect(saveProduct(product(f, slug, { sku: `RD-${f.tag}`, priceMmk: 10_000 }, { published: true }), f.userId)).rejects.toMatchObject({
      name: "ReadinessError",
      issues: [{ code: "NO_WEIGHT", skus: [`RD-${f.tag}`] }],
    });
    expect(await prisma.product.findUnique({ where: { slug } })).toBeNull(); // rollback cả SP

    await expect(
      saveProduct(product(f, slug, { sku: `RD-${f.tag}`, priceMmk: 0, weightGrams: 100 }, { published: true }), f.userId),
    ).rejects.toMatchObject({ issues: [{ code: "PRICE_ZERO" }] });

    const ok = await saveProduct(product(f, slug, { sku: `RD-${f.tag}`, priceMmk: 10_000, weightGrams: 100 }, { published: true }), f.userId);
    expect(ok.published).toBe(true);
    const r = (await loadReadiness(prisma, [ok.id])).get(ok.id)!;
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(["NO_IMAGE", "OUT_OF_STOCK"]));
  });

  it("SP đang hiển thị: lưu được dù còn lỗi khác (không tự ẩn), nhưng không cho đặt giá 0", async () => {
    const f = await makeFixture();
    const slug = `rp-${f.tag.toLowerCase()}`;
    const p = await saveProduct(product(f, slug, { sku: `RP-${f.tag}`, priceMmk: 10_000, weightGrams: 100 }, { published: true }), f.userId);
    const variant = await prisma.variant.findUniqueOrThrow({ where: { sku: `RP-${f.tag}` } });
    // Bỏ khối lượng: vẫn lưu được (SP cũ đang bán), danh sách báo lỗi.
    await saveProduct(product(f, slug, { id: variant.id, sku: `RP-${f.tag}`, priceMmk: 10_000, weightGrams: null }, { id: p.id, published: true }), f.userId);
    expect((await loadReadiness(prisma, [p.id])).get(p.id)!.errors).toEqual([{ code: "NO_WEIGHT", skus: [`RP-${f.tag}`] }]);
    await expect(
      saveProduct(product(f, slug, { id: variant.id, sku: `RP-${f.tag}`, priceMmk: 0, weightGrams: null }, { id: p.id, published: true }), f.userId),
    ).rejects.toMatchObject({ issues: [{ code: "PRICE_ZERO" }] });
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } })).priceMmk).toBe(10_000);
  });

  it("bật hàng loạt: SP hợp lệ được bật, SP còn lỗi giữ ẩn và trả lý do", async () => {
    const f = await makeFixture();
    const good = await saveProduct(product(f, `rg-${f.tag.toLowerCase()}`, { sku: `RG-${f.tag}`, priceMmk: 5_000, weightGrams: 50 }), f.userId);
    const bad = await saveProduct(product(f, `rb-${f.tag.toLowerCase()}`, { sku: `RB-${f.tag}`, priceMmk: 0 }), f.userId);
    const res = await setProductsPublished({ ids: [good.id, bad.id], published: true }, f.userId);
    expect(res.changed).toBe(1);
    expect(res.blocked).toEqual([
      expect.objectContaining({
        id: bad.id,
        issues: [
          { code: "PRICE_ZERO", skus: [`RB-${f.tag}`] },
          { code: "NO_WEIGHT", skus: [`RB-${f.tag}`] },
        ],
      }),
    ]);
    const rows = await prisma.product.findMany({ where: { id: { in: [good.id, bad.id] } }, select: { id: true, published: true } });
    expect(Object.fromEntries(rows.map((r) => [r.id, r.published]))).toEqual({ [good.id]: true, [bad.id]: false });
  });

  it("cảnh báo tồn: thiếu giá vốn, tồn nằm ở kho bán khác", async () => {
    const f = await makeFixture();
    await prisma.variant.update({ where: { id: f.variantId }, data: { weightGrams: 100 } });
    // Nhập thẳng vào kho Chi (kho bán khác kho của SP) → tồn không bán được ở kho Thắm.
    await prisma.product.update({ where: { id: f.productId }, data: { stockLocationId: f.chi.id } });
    const doc = await createDocument(
      { type: "RECEIVE", toId: f.chi.id, lines: [{ variantId: f.variantId, lotNo: "C", expiryDate: "2028-12-31", unitCostMmk: 1_000, qty: 2 }] },
      f.userId,
    );
    await postDocument(doc.id, f.userId);
    await prisma.product.update({ where: { id: f.productId }, data: { stockLocationId: f.mm.id } });
    const r = (await loadReadiness(prisma, [f.productId])).get(f.productId)!;
    expect(r.warnings).toEqual(expect.arrayContaining([{ code: "STOCK_OTHER_WAREHOUSE", skus: [`IT-${f.tag}`] }, { code: "OUT_OF_STOCK" }]));
  });
});
