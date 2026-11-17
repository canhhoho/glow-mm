import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createDocument, saveReceiveDrafts } from "@/server/inventory/documents";
import { makeFixture, type Fixture } from "./fixtures";

// Phiếu nhập nháp tách theo kho (Phase 3, 16/11/2026): mỗi dòng có kho riêng, lưu thì mỗi kho một phiếu trong MỘT transaction.

async function extraProduct(f: Fixture, name: string) {
  const p = await prisma.product.create({
    data: {
      slug: `it-${f.tag}-${name}`,
      brandId: f.brandId,
      categoryId: f.categoryId,
      preorderEnabled: false,
      translations: { create: { locale: "en", name: `${name} ${f.tag}`, searchText: f.tag } },
      variants: { create: { sku: `IT-${f.tag}-${name}`, label: name, priceMmk: 10_000 } },
    },
    include: { variants: true },
  });
  return p.variants[0].id; // SP chưa có kho (chưa nhập hàng)
}
async function extraVariant(f: Fixture, name: string) {
  return (await prisma.variant.create({ data: { productId: f.productId, sku: `IT-${f.tag}-${name}`, label: name, priceMmk: 10_000 } })).id;
}

const vnd = (variantId: string, toId: string, lotNo: string, cost = 100_000, extra: Record<string, unknown> = {}) => ({ variantId, toId, lotNo, expiryDate: "2029-12-31", unitCostVnd: cost, qty: 2, ...extra });
const mmk = (variantId: string, toId: string, lotNo: string) => ({ variantId, toId, lotNo, expiryStatus: "NONE", unitCostMmk: 5_000, qty: 3 });
const docsOf = (variantIds: string[]) => prisma.stockDocument.findMany({ where: { lines: { some: { variantId: { in: variantIds } } } }, include: { lines: true }, orderBy: { createdAt: "asc" } });

describe("Phiếu nhập nháp tự tách theo kho", () => {
  it("tạo: mỗi kho một phiếu; gửi lại cùng khoá không tạo thêm", async () => {
    const f = await makeFixture();
    const b = await extraProduct(f, "B");
    const key = `split-${f.tag}-1`;
    const payload = { type: "RECEIVE", idempotencyKey: key, reason: "Đợt 1", lines: [vnd(f.variantId, f.mm.id, "A1"), mmk(b, f.chi.id, "B1")] };
    const first = await saveReceiveDrafts(payload, f.userId);
    expect(first.split).toBe(true);
    expect(first.documents.map((d) => d.toId)).toEqual([f.mm.id, f.chi.id]);
    expect(first.documents.map((d) => d.idempotencyKey)).toEqual([`${key}:${f.mm.id}`, `${key}:${f.chi.id}`]);
    expect(first.documents.every((d) => d.status === "DRAFT" && d.reason === "Đợt 1")).toBe(true);

    const again = await saveReceiveDrafts(payload, f.userId);
    expect(again.documents.map((d) => d.id)).toEqual(first.documents.map((d) => d.id));
    expect(await docsOf([f.variantId, b])).toHaveLength(2);
  });

  it("một kho: một phiếu, giữ nguyên khoá; payload cũ chỉ có toId cấp phiếu vẫn chạy", async () => {
    const f = await makeFixture();
    const key = `split-${f.tag}-2`;
    const one = await saveReceiveDrafts({ type: "RECEIVE", idempotencyKey: key, lines: [vnd(f.variantId, f.mm.id, "A1")] }, f.userId);
    expect(one.split).toBe(false);
    expect(one.documents[0].idempotencyKey).toBe(key);
    const legacy = await saveReceiveDrafts({ type: "RECEIVE", toId: f.qc.id, lines: [{ ...vnd(f.variantId, f.qc.id, "A2"), toId: undefined }] }, f.userId);
    expect(legacy.documents[0].toId).toBe(f.qc.id);
  });

  it("sửa: phiếu gốc giữ nhóm cùng kho (mã/id không đổi), nhóm còn lại thành phiếu mới", async () => {
    const f = await makeFixture();
    const b = await extraProduct(f, "B");
    const [doc] = (await saveReceiveDrafts({ type: "RECEIVE", reason: "Gốc", lines: [vnd(f.variantId, f.mm.id, "A1")] }, f.userId)).documents;
    const res = await saveReceiveDrafts(
      { type: "RECEIVE", reason: "Gốc", idempotencyKey: `split-${f.tag}-3`, lines: [mmk(b, f.chi.id, "B1"), vnd(f.variantId, f.mm.id, "A1", 110_000)] },
      f.userId,
      { documentId: doc.id },
    );
    expect(res.documents[0].id).toBe(doc.id); // phiếu gốc đứng đầu
    expect(res.documents).toHaveLength(2);
    const origin = await prisma.stockDocument.findUniqueOrThrow({ where: { id: doc.id }, include: { lines: true } });
    expect(origin).toMatchObject({ toId: f.mm.id, code: doc.code, status: "DRAFT" });
    expect(origin.lines).toHaveLength(1);
    expect(origin.lines[0].unitCostVnd).toBe(110_000);
    const created = res.documents[1];
    expect(created.id).not.toBe(doc.id);
    expect(created).toMatchObject({ toId: f.chi.id, reason: "Gốc", status: "DRAFT" });
    // gửi lại (bấm hai lần): không tạo thêm phiếu thứ ba
    const again = await saveReceiveDrafts(
      { type: "RECEIVE", reason: "Gốc", idempotencyKey: `split-${f.tag}-3`, lines: [mmk(b, f.chi.id, "B1"), vnd(f.variantId, f.mm.id, "A1", 110_000)] },
      f.userId,
      { documentId: doc.id },
    );
    expect(again.documents.map((d) => d.id)).toEqual([doc.id, created.id]);
    expect(await docsOf([f.variantId, b])).toHaveLength(2);
  });

  it("sửa: chuyển hết dòng sang kho khác → phiếu gốc đổi kho, không rỗng, không sinh phiếu mới", async () => {
    const f = await makeFixture();
    const b = await extraProduct(f, "B");
    const [doc] = (await saveReceiveDrafts({ type: "RECEIVE", lines: [vnd(f.variantId, f.mm.id, "A1")] }, f.userId)).documents;
    const res = await saveReceiveDrafts({ type: "RECEIVE", lines: [mmk(b, f.chi.id, "B1")] }, f.userId, { documentId: doc.id });
    expect(res.documents.map((d) => d.id)).toEqual([doc.id]);
    const now = await prisma.stockDocument.findUniqueOrThrow({ where: { id: doc.id }, include: { lines: true } });
    expect(now.toId).toBe(f.chi.id);
    expect(now.lines.map((l) => l.variantId)).toEqual([b]);
  });

  it("giữ tỷ giá đã chốt của dòng không đổi khi dòng đó chuyển sang phiếu mới", async () => {
    const f = await makeFixture();
    const a2 = await extraVariant(f, "A2");
    const rate = await prisma.exchangeRate.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
    // Phiếu gốc ở QC (không bán) có hai dòng; dòng A1 đã chốt tỷ giá (vd nhập từ Excel).
    const [doc] = (await saveReceiveDrafts({ type: "RECEIVE", lines: [vnd(f.variantId, f.qc.id, "A1"), vnd(a2, f.qc.id, "A2", 200_000)] }, f.userId)).documents;
    await prisma.stockDocumentLine.updateMany({ where: { documentId: doc.id, variantId: f.variantId }, data: { rateId: rate.id } });
    // Sửa: A1 sang kho bán (phiếu mới), A2 ở lại QC (phiếu gốc).
    const res = await saveReceiveDrafts({ type: "RECEIVE", lines: [vnd(f.variantId, f.mm.id, "A1"), vnd(a2, f.qc.id, "A2", 200_000)] }, f.userId, { documentId: doc.id });
    expect(res.documents).toHaveLength(2);
    const moved = await prisma.stockDocumentLine.findFirstOrThrow({ where: { documentId: res.documents[1].id, variantId: f.variantId } });
    expect(moved.rateId).toBe(rate.id);
  });

  it("khối lượng chỉ ghi qua một phiếu", async () => {
    const f = await makeFixture();
    const { documents } = await saveReceiveDrafts(
      { type: "RECEIVE", lines: [vnd(f.variantId, f.mm.id, "A1"), vnd(f.variantId, f.qc.id, "A2")], weights: [{ variantId: f.variantId, weightGrams: 120 }] },
      f.userId,
    );
    expect(documents).toHaveLength(2);
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } })).weightGrams).toBe(120);
    const logs = await prisma.auditLog.findMany({ where: { action: "variant.weight", entityId: f.variantId } });
    expect(logs).toHaveLength(1);
  });

  it("một SP không nhập vào hai kho bán trong cùng lần lưu; lỗi thì không để lại phiếu nào", async () => {
    const f = await makeFixture();
    const b = await extraProduct(f, "B");
    await expect(saveReceiveDrafts({ type: "RECEIVE", lines: [vnd(b, f.mm.id, "B1"), mmk(b, f.chi.id, "B2")] }, f.userId)).rejects.toThrow(/một sản phẩm chỉ thuộc một kho bán/);
    expect(await docsOf([b])).toHaveLength(0);
  });

  it("nhóm sau lỗi (thiếu giá) thì phiếu nhóm trước cũng không được tạo", async () => {
    const f = await makeFixture();
    const b = await extraProduct(f, "B");
    const bad = { variantId: b, toId: f.chi.id, lotNo: "B1", expiryStatus: "NONE", qty: 1, unitCostVnd: 100 }; // kho MMK phải nhập giá MMK
    await expect(saveReceiveDrafts({ type: "RECEIVE", lines: [vnd(f.variantId, f.mm.id, "A1"), bad] }, f.userId)).rejects.toThrow(/MMK/);
    expect(await docsOf([f.variantId, b])).toHaveLength(0);
  });

  it("cùng SKU + số lô nhưng khác hạn dùng ở hai kho vẫn bị chặn", async () => {
    const f = await makeFixture();
    await expect(
      saveReceiveDrafts({ type: "RECEIVE", lines: [vnd(f.variantId, f.mm.id, "L1"), vnd(f.variantId, f.qc.id, "L1", 100_000, { expiryDate: "2030-06-30" })] }, f.userId),
    ).rejects.toThrow(/hạn dùng khác/);
    expect(await docsOf([f.variantId])).toHaveLength(0);
  });

  it("createDocument một kho vẫn như cũ (Excel / test gọi thẳng)", async () => {
    const f = await makeFixture();
    const doc = await createDocument({ type: "RECEIVE", toId: f.mm.id, lines: [{ ...vnd(f.variantId, f.mm.id, "A1"), toId: undefined }] }, f.userId);
    expect(doc.toId).toBe(f.mm.id);
  });
});
