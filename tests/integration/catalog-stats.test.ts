import { readSheet } from "read-excel-file/node";
import { afterAll, describe, expect, it, vi } from "vitest";
import { CATALOG_HEADER_ROW, CATALOG_SHEET, sheetHeaderKey } from "@/lib/catalog-sheet";
import { toCsv } from "@/lib/csv";
import { previewCatalogImport } from "@/server/catalog/catalog-import";
import { catalogTemplateFile } from "@/server/catalog/catalog-template";
import { prisma } from "@/lib/db";
import { getProductForEdit } from "@/server/catalog/admin-queries";
import { saveProduct } from "@/server/catalog/products";
import { reviewProducts, submitProducts } from "@/server/catalog/review";
import { catalogStats } from "@/server/catalog/stats";
import { createDocument, postDocument } from "@/server/inventory/documents";
import { makeFixture, unpublishTestProducts } from "./fixtures";

// Quy tắc khi BẬT giá tự động (thiếu khối lượng ở kho nhập VN = lỗi); hành vi tắt: tests/unit/readiness-weight-off.test.ts.
vi.mock("@/lib/features", async (orig) => (await import("../support/features")).featuresWith(orig, { autoPricing: true }));


afterAll(unpublishTestProducts);

// P2: số liệu dashboard theo đúng nhãn; duyệt hàng loạt có kết quả theo từng SP.

async function readyProduct() {
  const f = await makeFixture();
  await prisma.product.update({ where: { id: f.productId }, data: { slug: `it-${f.tag.toLowerCase()}` } });
  await prisma.variant.update({ where: { id: f.variantId }, data: { weightGrams: 100 } });
  const doc = await createDocument({ type: "RECEIVE", toId: f.mm.id, lines: [{ variantId: f.variantId, lotNo: "A", expiryDate: "2029-12-31", unitCostVnd: 1000, qty: 2 }] }, f.userId);
  await postDocument(doc.id, f.userId);
  return f;
}
const version = async (id: string) => (await prisma.product.findUniqueOrThrow({ where: { id } })).approvalVersion;

describe("catalogStats (P2)", () => {
  it("các nhãn cộng lại = tổng SP; số chờ duyệt / đang bán / hết hàng đổi đúng theo thao tác", async () => {
    const all = await prisma.product.count();
    const s0 = await catalogStats();
    expect(Object.values(s0.byLabel).reduce((a, b) => a + b, 0)).toBe(all);
    expect(s0.totalProducts).toBe(await prisma.product.count({ where: { archivedAt: null } }));
    expect(s0.skus).toBe(await prisma.variant.count({ where: { active: true, product: { archivedAt: null } } }));

    const incomplete = await makeFixture(); // thiếu khối lượng → nháp còn thiếu
    const ready = await readyProduct();
    const s1 = await catalogStats();
    expect(s1.byLabel.DRAFT - s0.byLabel.DRAFT).toBe(2);
    expect(s1.draftIncomplete - s0.draftIncomplete).toBe(1);

    await submitProducts({ ids: [ready.productId] }, ready.userId);
    const s2 = await catalogStats();
    expect(s2.awaitingReview - s1.awaitingReview).toBe(1);
    expect(s2.byLabel.PENDING - s1.byLabel.PENDING).toBe(1);

    await reviewProducts({ decision: "approvePublish", items: [{ id: ready.productId, version: await version(ready.productId) }] }, ready.userId);
    const s3 = await catalogStats();
    expect(s3.byLabel.PUBLISHED - s2.byLabel.PUBLISHED).toBe(1);
    expect(s3.awaitingReview - s2.awaitingReview).toBe(-1);
    expect(incomplete.productId).toBeTruthy();

    // Hết hàng: xuất hết tồn → đang bán + hết hàng (SP fixture tắt đặt trước).
    const out = await createDocument({ type: "ISSUE", fromId: ready.mm.id, reason: "test", lines: [{ variantId: ready.variantId, qty: 2 }] }, ready.userId);
    await postDocument(out.id, ready.userId);
    const s4 = await catalogStats();
    expect(s4.published.outOfStock - s3.published.outOfStock).toBe(1);
    expect(s4.published.preorder - s3.published.preorder).toBe(0);
  });
});

describe("Duyệt hàng loạt (P2)", () => {
  it("kết quả theo từng SP: SP đổi sau khi xem bị bỏ qua, SP khác vẫn được duyệt; mỗi SP một transaction", async () => {
    const items = [];
    for (let i = 0; i < 12; i++) {
      const f = await readyProduct();
      await submitProducts({ ids: [f.productId] }, f.userId);
      items.push({ f, version: await version(f.productId) });
    }
    // Một SP bị sửa sau khi người duyệt đã xem danh sách.
    const changed = items[0].f;
    const form = (await getProductForEdit(changed.productId))!;
    await saveProduct({ ...form, en: { ...form.en, name: "Đổi sau khi xem" } }, changed.userId);

    const started = Date.now();
    const results = await reviewProducts({ decision: "approve", items: items.map((i) => ({ id: i.f.productId, version: i.version })) }, changed.userId);
    const elapsed = Date.now() - started;
    expect(results.filter((r) => r.ok)).toHaveLength(11);
    expect(results.find((r) => r.id === changed.productId)).toMatchObject({ ok: false, stateChanged: true });
    expect(elapsed / items.length).toBeLessThan(2_000); // mỗi SP một transaction ngắn
  });
});

describe("Xuất Excel SP hiện có (16/11/2026: cùng cột với mẫu, không có cột giá)", () => {
  it("một cột tên, không có giá / hoa hồng; nhập lại đúng dòng đó → không thay đổi gì", async () => {
    const f = await makeFixture();
    await prisma.product.update({ where: { id: f.productId }, data: { slug: `it-${f.tag.toLowerCase()}` } });
    await prisma.variant.update({ where: { id: f.variantId }, data: { affiliateCommissionMmk: 500 } });
    const rows = await readSheet(Buffer.from(await catalogTemplateFile(true)), CATALOG_SHEET);
    const header = rows[CATALOG_HEADER_ROW - 1].map(sheetHeaderKey);
    for (const gone of ["price_mmk", "affiliate_commission_mmk", "name_my", "name_en"]) expect(header).not.toContain(gone);
    const mine = rows.find((r) => r[header.indexOf("sku")] === `IT-${f.tag}`)!;
    expect(mine[header.indexOf("name")]).toBe(`IT product ${f.tag}`);

    const keep = header.map((k, i) => [k, i] as const).filter(([k]) => k);
    const csv = toCsv([keep.map(([k]) => k), keep.map(([, i]) => (mine[i] == null ? "" : String(mine[i])))]);
    const preview = await previewCatalogImport({ csv });
    expect(preview.errors).toEqual([]);
    expect(preview.rows[0]).toMatchObject({ action: "same" });
    expect(preview.counts).toMatchObject({ updatedProducts: 0 });
  });
});
