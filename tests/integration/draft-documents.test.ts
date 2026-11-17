import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { deleteProducts } from "@/server/catalog/product-delete";
import { cancelDocument, createDocument, postDocument, updateReceiveDraft } from "@/server/inventory/documents";
import { parseStockFilter, stockByVariant } from "@/server/inventory/overview";
import { listVariantsForReceive } from "@/server/inventory/queries";
import { makeFixture, type Fixture } from "./fixtures";

// Phiếu nháp: chống tạo trùng, sửa phiếu nhập nháp, huỷ nháp dọn lô / trả khối lượng; xoá SP bỏ qua phiếu đã huỷ;
// trang Tồn kho ẩn SP chưa từng nhập hàng.

const receive = (f: Fixture, lot: string, cost: number, qty = 2, extra: Record<string, unknown> = {}) => ({
  type: "RECEIVE",
  toId: f.mm.id,
  lines: [{ variantId: f.variantId, lotNo: lot, expiryDate: "2029-12-31", unitCostVnd: cost, qty }],
  ...extra,
});
const docCount = (f: Fixture) => prisma.stockDocument.count({ where: { lines: { some: { variantId: f.variantId } } } });

describe("Phiếu nháp", () => {
  it("cùng khoá chống trùng (tuần tự và song song) chỉ tạo một phiếu", async () => {
    const f = await makeFixture();
    const key = `it-${f.tag}-receive-1`;
    const a = await createDocument(receive(f, "A", 100_000, 2, { idempotencyKey: key }), f.userId);
    const b = await createDocument(receive(f, "A", 100_000, 2, { idempotencyKey: key }), f.userId);
    expect(b.id).toBe(a.id);
    const key2 = `it-${f.tag}-receive-2`;
    const both = await Promise.all([
      createDocument(receive(f, "B", 100_000, 1, { idempotencyKey: key2 }), f.userId),
      createDocument(receive(f, "B", 100_000, 1, { idempotencyKey: key2 }), f.userId),
    ]);
    expect(both[0].id).toBe(both[1].id);
    expect(await docCount(f)).toBe(2);
  });

  it("sửa phiếu nhập nháp: thay dòng, lô cũ bị xoá; phiếu đã ghi sổ không sửa được", async () => {
    const f = await makeFixture();
    const doc = await createDocument(receive(f, "OLD", 100_000, 2), f.userId);
    await updateReceiveDraft(doc.id, receive(f, "NEW", 120_000, 5, { reason: "Sửa SL" }), f.userId);
    const lines = await prisma.stockDocumentLine.findMany({ where: { documentId: doc.id }, include: { batch: true } });
    expect(lines.map((l) => [l.qty, l.batch?.lotNo, l.batch?.unitCostVnd])).toEqual([[5, "NEW", 120_000]]);
    expect(await prisma.batch.findUnique({ where: { variantId_lotNo: { variantId: f.variantId, lotNo: "OLD" } } })).toBeNull();
    expect((await prisma.stockDocument.findUniqueOrThrow({ where: { id: doc.id } })).reason).toBe("Sửa SL");
    // Sửa lại cùng số lô với giá khác: lô nháp cũ được thay, không báo "lô đã có với giá vốn khác".
    await updateReceiveDraft(doc.id, receive(f, "NEW", 130_000, 5), f.userId);
    expect((await prisma.batch.findUniqueOrThrow({ where: { variantId_lotNo: { variantId: f.variantId, lotNo: "NEW" } } })).unitCostVnd).toBe(130_000);
    expect(await docCount(f)).toBe(1);

    await postDocument(doc.id, f.userId);
    await expect(updateReceiveDraft(doc.id, receive(f, "X", 1, 1), f.userId)).rejects.toThrow(/đang nháp/);
  });

  it("huỷ nháp: xoá lô nháp, nhập lại cùng số lô giá khác được; trả khối lượng phiếu đã điền; giá mua gợi ý bỏ lô đã huỷ", async () => {
    const f = await makeFixture();
    const doc = await createDocument(receive(f, "L1", 100_000, 2, { weights: [{ variantId: f.variantId, weightGrams: 150 }] }), f.userId);
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } })).weightGrams).toBe(150);
    await cancelDocument(doc.id, f.userId);
    expect(await prisma.stockDocument.findUniqueOrThrow({ where: { id: doc.id } })).toMatchObject({ status: "CANCELLED" });
    expect(await prisma.batch.count({ where: { variantId: f.variantId } })).toBe(0);
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } })).weightGrams).toBeNull();
    expect((await listVariantsForReceive()).find((v) => v.id === f.variantId)?.lastCost).toBeNull();

    const again = await createDocument(receive(f, "L1", 90_000, 1), f.userId);
    expect((await prisma.batch.findUniqueOrThrow({ where: { variantId_lotNo: { variantId: f.variantId, lotNo: "L1" } } })).unitCostVnd).toBe(90_000);
    await cancelDocument(again.id, f.userId);
  });

  it("xoá SP: chỉ có phiếu nháp đã huỷ → xoá hẳn; có phiếu ghi sổ → ngừng kinh doanh", async () => {
    const f = await makeFixture();
    const g = await makeFixture();
    const doc = await createDocument(receive(f, "T1", 100_000), f.userId);
    await cancelDocument(doc.id, f.userId);
    const posted = await createDocument(receive(g, "P1", 100_000), g.userId);
    await postDocument(posted.id, g.userId);

    expect(await deleteProducts([f.productId, g.productId], f.userId)).toEqual({ deleted: 1, archived: 1 });
    expect(await prisma.product.findUnique({ where: { id: f.productId } })).toBeNull();
    expect(await prisma.stockDocument.findUnique({ where: { id: doc.id } })).toBeNull(); // phiếu huỷ không còn dòng
    expect((await prisma.product.findUniqueOrThrow({ where: { id: g.productId } })).archivedAt).not.toBeNull();
  });

  it("xoá SP: chỉ nằm trong phiếu nhập NHÁP (chưa nhập kho) → xoá hẳn, xoá luôn dòng/lô/phiếu nháp rỗng", async () => {
    const f = await makeFixture();
    const doc = await createDocument(receive(f, "D1", 100_000), f.userId);

    expect(await deleteProducts([f.productId], f.userId)).toEqual({ deleted: 1, archived: 0 });
    expect(await prisma.product.findUnique({ where: { id: f.productId } })).toBeNull();
    expect(await prisma.batch.count({ where: { variantId: f.variantId } })).toBe(0);
    expect(await prisma.stockDocument.findUnique({ where: { id: doc.id } })).toBeNull(); // phiếu nháp không còn dòng
  });

  it("Tồn kho 'Tất cả' ẩn SP chưa từng nhập; bộ lọc 'Chưa nhập hàng' liệt kê nó", async () => {
    const f = await makeFixture();
    const sku = (await prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } })).sku;
    const all = await stockByVariant(parseStockFilter({ q: sku }));
    expect(all.rows.map((r) => r.variantId)).not.toContain(f.variantId);
    const pending = await stockByVariant(parseStockFilter({ q: sku, received: "no" }));
    expect(pending.rows.map((r) => r.variantId)).toEqual([f.variantId]);

    const doc = await createDocument(receive(f, "R1", 100_000), f.userId);
    await postDocument(doc.id, f.userId);
    expect((await stockByVariant(parseStockFilter({ q: sku }))).rows.map((r) => r.variantId)).toEqual([f.variantId]);
    expect((await stockByVariant(parseStockFilter({ q: sku, received: "no" }))).rows).toEqual([]);
  });
});
