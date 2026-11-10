import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createDocument, postDocument } from "@/server/inventory/documents";
import { loadReadiness } from "@/server/catalog/readiness";
import { saveProduct, setProductsPublished } from "@/server/catalog/products";
import { makeFixture, markApproved, unpublishTestProducts, type Fixture } from "./fixtures";

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
  it("P0-H1: lưu form không bao giờ bật hiển thị; bật qua cổng mở bán — thiếu khối lượng / giá 0 bị chặn, đủ thì bật được dù thiếu ảnh", async () => {
    const f = await makeFixture();
    const slug = `rd-${f.tag.toLowerCase()}`;
    // Payload cũ còn `published: true` (form gửi kèm) → bị bỏ qua, SP vẫn ẩn, không có audit publish.
    const draft = await saveProduct(product(f, slug, { sku: `RD-${f.tag}`, priceMmk: 0 }, { published: true }), f.userId);
    expect(draft.published).toBe(false);
    expect(await prisma.auditLog.count({ where: { entityId: draft.id, action: "product.publish" } })).toBe(0);
    expect(await setProductsPublished({ ids: [draft.id], published: true }, f.userId)).toMatchObject({
      changed: 0,
      blocked: [{ issues: [{ code: "PRICE_ZERO" }, { code: "NO_WEIGHT", skus: [`RD-${f.tag}`] }, { code: "NOT_APPROVED" }] }],
    });

    const v = await prisma.variant.findUniqueOrThrow({ where: { sku: `RD-${f.tag}` } });
    await saveProduct(product(f, slug, { id: v.id, sku: `RD-${f.tag}`, priceMmk: 10_000, weightGrams: 100 }, { id: draft.id }), f.userId);
    // QT2: SP mới phải được duyệt trước khi bật hiển thị.
    await markApproved(draft.id);
    expect(await setProductsPublished({ ids: [draft.id], published: true }, f.userId)).toMatchObject({ changed: 1, blocked: [] });
    expect(await prisma.auditLog.count({ where: { entityId: draft.id, action: "product.publish" } })).toBe(1);
    const r = (await loadReadiness(prisma, [draft.id])).get(draft.id)!;
    expect(r.errors).toEqual([]);
    // QT3: SP mới mặc định nhận đặt trước → hết hàng không còn là cảnh báo.
    expect(r.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(["NO_IMAGE"]));
    expect(r.warnings.map((w) => w.code)).not.toContain("OUT_OF_STOCK");
  });

  it("P0-H1: form cũ (published=true) không bật lại SP đã bị ẩn ở nơi khác", async () => {
    const f = await makeFixture();
    const slug = `rh-${f.tag.toLowerCase()}`;
    const p = await saveProduct(product(f, slug, { sku: `RH-${f.tag}`, priceMmk: 10_000, weightGrams: 100 }), f.userId);
    await markApproved(p.id, { published: true });
    await setProductsPublished({ ids: [p.id], published: false }, f.userId);
    const v = await prisma.variant.findUniqueOrThrow({ where: { sku: `RH-${f.tag}` } });
    const saved = await saveProduct(product(f, slug, { id: v.id, sku: `RH-${f.tag}`, priceMmk: 10_000, weightGrams: 100 }, { id: p.id, published: true }), f.userId);
    expect(saved.published).toBe(false);
  });

  it("SP đang hiển thị: lưu được dù còn lỗi khác (không tự ẩn), nhưng không cho đặt giá 0", async () => {
    const f = await makeFixture();
    const slug = `rp-${f.tag.toLowerCase()}`;
    const p = await saveProduct(product(f, slug, { sku: `RP-${f.tag}`, priceMmk: 10_000, weightGrams: 100 }), f.userId);
    await markApproved(p.id, { published: true });
    const variant = await prisma.variant.findUniqueOrThrow({ where: { sku: `RP-${f.tag}` } });
    // Bỏ khối lượng: vẫn lưu được (SP cũ đang bán), danh sách báo lỗi; nội dung đổi → cần duyệt lại (QT2).
    await saveProduct(product(f, slug, { id: variant.id, sku: `RP-${f.tag}`, priceMmk: 10_000, weightGrams: null }, { id: p.id, published: true }), f.userId);
    expect((await loadReadiness(prisma, [p.id])).get(p.id)!.errors).toEqual([{ code: "NO_WEIGHT", skus: [`RP-${f.tag}`] }, { code: "NOT_APPROVED" }]);
    await expect(
      saveProduct(product(f, slug, { id: variant.id, sku: `RP-${f.tag}`, priceMmk: 0, weightGrams: null }, { id: p.id, published: true }), f.userId),
    ).rejects.toMatchObject({ issues: [{ code: "PRICE_ZERO" }] });
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } })).priceMmk).toBe(10_000);
  });

  it("bật hàng loạt: SP hợp lệ được bật, SP còn lỗi giữ ẩn và trả lý do", async () => {
    const f = await makeFixture();
    const good = await saveProduct(product(f, `rg-${f.tag.toLowerCase()}`, { sku: `RG-${f.tag}`, priceMmk: 5_000, weightGrams: 50 }), f.userId);
    const bad = await saveProduct(product(f, `rb-${f.tag.toLowerCase()}`, { sku: `RB-${f.tag}`, priceMmk: 0 }), f.userId);
    await markApproved(good.id);
    const res = await setProductsPublished({ ids: [good.id, bad.id], published: true }, f.userId);
    expect(res.changed).toBe(1);
    expect(res.blocked).toEqual([
      expect.objectContaining({
        id: bad.id,
        issues: [
          { code: "PRICE_ZERO", skus: [`RB-${f.tag}`] },
          { code: "NO_WEIGHT", skus: [`RB-${f.tag}`] },
          { code: "NOT_APPROVED" },
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
