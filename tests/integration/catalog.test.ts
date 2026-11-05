import Rabbit from "rabbit-node";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { toCsv } from "@/lib/csv";
import { importOpeningStockCsv, importProductsCsv, PRODUCT_CSV_COLUMNS, saveProduct, setProductsPublished, STOCK_CSV_COLUMNS } from "@/server/catalog/products";
import { createDocument, postDocument } from "@/server/inventory/documents";
import { listProductsAdmin } from "@/server/catalog/admin-queries";
import { deleteProducts, restoreProducts } from "@/server/catalog/product-delete";
import { balance, makeFixture } from "./fixtures";

const base = (f: Awaited<ReturnType<typeof makeFixture>>, slug: string) => ({
  slug,
  brandId: f.brandId,
  categoryId: f.categoryId,
  stockLocationId: f.mm.id, // P24: cùng kho với SP fixture (combo cần thành phần cùng kho)
  my: { name: "နေကာခရင်မ်" },
  en: { name: "Sunscreen" },
});

describe("Sản phẩm", () => {
  it("đổi giá ghi lịch sử giá; tên Myanmar Zawgyi được chuyển Unicode", async () => {
    const f = await makeFixture();
    const slug = `p-${f.tag.toLowerCase()}`;
    const p = await saveProduct(
      { ...base(f, slug), my: { name: Rabbit.uni2zg("နေကာခရင်မ်") }, variants: [{ sku: `P-${f.tag}`, label: "50ml", priceMmk: 20000 }] },
      f.userId,
    );
    const v = await prisma.variant.findUniqueOrThrow({ where: { sku: `P-${f.tag}` } });
    await saveProduct({ ...base(f, slug), id: p.id, variants: [{ id: v.id, sku: v.sku, label: "50ml", priceMmk: 22000 }] }, f.userId);

    const hist = await prisma.priceHistory.findMany({ where: { variantId: v.id } });
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ oldPriceMmk: 20000, newPriceMmk: 22000, reason: "manual" });
    const my = await prisma.productTranslation.findUniqueOrThrow({ where: { productId_locale: { productId: p.id, locale: "my" } } });
    expect(my.name).toBe("နေကာခရင်မ်");
  });

  it("combo phải có thành phần hợp lệ (không phải chính nó / combo khác)", async () => {
    const f = await makeFixture();
    await expect(
      saveProduct({ ...base(f, `c-${f.tag.toLowerCase()}`), variants: [{ sku: `C-${f.tag}`, label: "Set", priceMmk: 1, isBundle: true }] }, f.userId),
    ).rejects.toThrow(/thành phần/);
    const ok = await saveProduct(
      {
        ...base(f, `c2-${f.tag.toLowerCase()}`),
        variants: [{ sku: `C2-${f.tag}`, label: "Set", priceMmk: 1, isBundle: true, components: [{ componentId: f.variantId, qty: 2 }] }],
      },
      f.userId,
    );
    const v = await prisma.variant.findFirstOrThrow({ where: { productId: ok.id }, include: { bundleItems: true } });
    expect(v.bundleItems).toEqual([expect.objectContaining({ componentId: f.variantId, qty: 2 })]);
  });

  it("bật/ẩn hàng loạt chỉ đổi SP khác trạng thái, ghi audit từng SP", async () => {
    const f = await makeFixture();
    const a = await saveProduct({ ...base(f, `ba-${f.tag.toLowerCase()}`), variants: [{ sku: `BA-${f.tag}`, label: "x", priceMmk: 1 }] }, f.userId);
    const b = await saveProduct(
      { ...base(f, `bb-${f.tag.toLowerCase()}`), published: true, variants: [{ sku: `BB-${f.tag}`, label: "x", priceMmk: 1 }] },
      f.userId,
    );

    expect(await setProductsPublished({ ids: [a.id, b.id, a.id], published: true }, f.userId)).toEqual({ changed: 1 });
    const rows = await prisma.product.findMany({ where: { id: { in: [a.id, b.id] } }, select: { published: true } });
    expect(rows.every((r) => r.published)).toBe(true);
    expect(await prisma.auditLog.count({ where: { entityId: a.id, action: "product.publish" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: b.id, action: "product.publish" } })).toBe(0);

    expect(await setProductsPublished({ ids: [a.id, b.id], published: false }, f.userId)).toEqual({ changed: 2 });
    expect(await prisma.product.count({ where: { id: { in: [a.id, b.id] }, published: true } })).toBe(0);
    await expect(setProductsPublished({ ids: [], published: true }, f.userId)).rejects.toThrow(/Chưa chọn/);
  });

  it("xoá: SP chưa có lịch sử xoá hẳn; SP có lô → ngừng kinh doanh, không bật lại được, khôi phục được", async () => {
    const f = await makeFixture();
    const clean = await saveProduct(
      { ...base(f, `del-${f.tag.toLowerCase()}`), published: true, variants: [{ sku: `DEL-${f.tag}`, label: "x", priceMmk: 1 }] },
      f.userId,
    );
    await saveProduct(
      { ...base(f, `del-${f.tag.toLowerCase()}`), id: clean.id, published: true, variants: [{ sku: `DEL-${f.tag}`, label: "x", priceMmk: 2 }] },
      f.userId,
    ); // có lịch sử giá — vẫn xoá được
    await createDocument(
      { type: "RECEIVE", toId: f.vn.id, lines: [{ variantId: f.variantId, lotNo: "L", expiryDate: "2029-01-01", unitCostVnd: 1, qty: 1 }] },
      f.userId,
    ); // SP của fixture có lô (phiếu nháp) → không xoá hẳn

    expect(await deleteProducts([clean.id, f.productId], f.userId)).toEqual({ deleted: 1, archived: 1 });
    expect(await prisma.product.findUnique({ where: { id: clean.id } })).toBeNull();
    expect(await prisma.variant.findUnique({ where: { sku: `DEL-${f.tag}` } })).toBeNull();
    const archived = await prisma.product.findUniqueOrThrow({ where: { id: f.productId } });
    expect(archived.archivedAt).not.toBeNull();
    expect(archived.published).toBe(false);
    expect(await prisma.auditLog.count({ where: { entityId: clean.id, action: "product.delete" } })).toBe(1);

    // Ngừng kinh doanh: không bật hiển thị; mặc định không hiện trong danh sách, có ở bộ lọc "archived".
    expect(await setProductsPublished({ ids: [f.productId], published: true }, f.userId)).toEqual({ changed: 0 });
    expect((await listProductsAdmin({ brandId: f.brandId })).map((p) => p.id)).not.toContain(f.productId);
    expect((await listProductsAdmin({ brandId: f.brandId, status: "archived" })).map((p) => p.id)).toEqual([f.productId]);

    expect(await restoreProducts([f.productId], f.userId)).toBe(1);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: f.productId } })).archivedAt).toBeNull();
  });

  it("lọc danh sách theo thương hiệu, danh mục (gồm danh mục con), trạng thái", async () => {
    const f = await makeFixture();
    const child = await prisma.category.create({ data: { slug: `it-${f.tag.toLowerCase()}-child`, parentId: f.categoryId } });
    const inChild = await saveProduct(
      { ...base(f, `fc-${f.tag.toLowerCase()}`), categoryId: child.id, published: true, variants: [{ sku: `FC-${f.tag}`, label: "x", priceMmk: 1 }] },
      f.userId,
    );
    const byCat = (await listProductsAdmin({ categoryId: f.categoryId })).map((p) => p.id);
    expect(byCat.sort()).toEqual([f.productId, inChild.id].sort());
    expect((await listProductsAdmin({ categoryId: child.id })).map((p) => p.id)).toEqual([inChild.id]);
    expect((await listProductsAdmin({ brandId: f.brandId, status: "published" })).map((p) => p.id)).toEqual([inChild.id]);
    expect((await listProductsAdmin({ brandId: f.brandId, status: "hidden" })).map((p) => p.id)).toEqual([f.productId]);
  });

  it("không cho SKU trùng với sản phẩm khác", async () => {
    const f = await makeFixture();
    const sku = (await prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } })).sku;
    await expect(
      saveProduct({ ...base(f, `d-${f.tag.toLowerCase()}`), variants: [{ sku, label: "x", priceMmk: 1 }] }, f.userId),
    ).rejects.toThrow(/SKU/);
  });
});

describe("Import CSV", () => {
  it("import sản phẩm gộp biến thể theo product_slug; chạy lại thì cập nhật, không nhân đôi", async () => {
    const f = await makeFixture();
    const cat = await prisma.category.findUniqueOrThrow({ where: { id: f.categoryId } });
    const slug = `imp-${f.tag.toLowerCase()}`;
    const row = (sku: string, label: string, price: number) => {
      const r: Record<string, string | number> = {
        product_slug: slug, brand: `Brand ${f.tag}`, category: cat.slug, name_my: "တိုနာ", name_en: "Toner",
        sku, variant_label: label, price_mmk: price,
      };
      return PRODUCT_CSV_COLUMNS.map((c) => r[c] ?? "");
    };
    const csv = toCsv([[...PRODUCT_CSV_COLUMNS], row(`I1-${f.tag}`, "100ml", 15000), row(`I2-${f.tag}`, "200ml", 25000)]);
    expect(await importProductsCsv(csv, f.userId)).toMatchObject({ ok: 2, errors: [] });
    expect(await importProductsCsv(csv, f.userId)).toMatchObject({ ok: 2, errors: [] });
    const p = await prisma.product.findUniqueOrThrow({ where: { slug }, include: { variants: true } });
    expect(p.variants).toHaveLength(2);
  });

  it("báo lỗi theo dòng: danh mục chưa có", async () => {
    const f = await makeFixture();
    const r: Record<string, string> = {
      product_slug: `bad-${f.tag.toLowerCase()}`, brand: "X", category: "khong-ton-tai", name_my: "a", name_en: "a",
      sku: `B-${f.tag}`, variant_label: "x", price_mmk: "1",
    };
    const res = await importProductsCsv(toCsv([[...PRODUCT_CSV_COLUMNS], PRODUCT_CSV_COLUMNS.map((c) => r[c] ?? "")]), f.userId);
    expect(res.ok).toBe(0);
    expect(res.errors[0]).toMatch(/Dòng 2/);
  });

  it("import tồn đầu kỳ tạo phiếu NHẬP NHÁP; chỉ có tồn sau khi ghi sổ", async () => {
    const f = await makeFixture();
    const sku = (await prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } })).sku;
    const csv = toCsv([
      [...STOCK_CSV_COLUMNS],
      [sku, f.vn.code, "OP1", "2028-01-31", "", 80000, 12, "SELLABLE"],
      [sku, f.vn.code, "OP1", "2028-01-31", "", 80000, 2, "TESTER"],
    ]);
    const res = await importOpeningStockCsv(csv, f.userId);
    expect(res.errors).toEqual([]);
    expect(res.documents).toHaveLength(1);
    const batch = await prisma.batch.findFirstOrThrow({ where: { variantId: f.variantId, lotNo: "OP1" } });
    expect(await balance(batch.id, f.vn.id)).toBe(0);
    await postDocument(res.documents![0].id, f.userId);
    expect(await balance(batch.id, f.vn.id)).toBe(12);
    expect(await balance(batch.id, f.vn.id, "TESTER")).toBe(2);
  });

  it("import tồn: SKU / vị trí không tồn tại → không tạo phiếu nào", async () => {
    const f = await makeFixture();
    const csv = toCsv([[...STOCK_CSV_COLUMNS], ["NO-SKU", f.vn.code, "L", "2028-01-01", "", 1, 1, ""]]);
    const res = await importOpeningStockCsv(csv, f.userId);
    expect(res.documents).toBeUndefined();
    expect(res.errors[0]).toMatch(/SKU/);
  });
});
