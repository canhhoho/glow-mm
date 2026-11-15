import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createDocument, postDocument } from "@/server/inventory/documents";
import { receiptSources, variantCosts } from "@/server/pricing/cost";
import { makeFixture, type Fixture } from "./fixtures";

// A1 (sửa luồng giá 16/11): nguồn giá mua chỉ là lần nhập hàng BÁN ĐƯỢC vào đúng kho bán của SP
// (hoặc kho chưa bán), không phải Tester / khu chờ kiểm tra / kho bán khác; chọn được lần nhập làm cơ sở.

const receive = async (f: Fixture, toId: string, lotNo: string, unitCostVnd: number, extra: Record<string, unknown> = {}) => {
  const doc = await createDocument({ type: "RECEIVE", toId, lines: [{ variantId: f.variantId, lotNo, expiryDate: "2029-12-31", unitCostVnd, qty: 2, ...extra }] }, f.userId);
  await postDocument(doc.id, f.userId);
  return doc;
};
const cost = async (f: Fixture, sourceLineIds?: Map<string, string>) =>
  (await variantCosts(prisma, [f.variantId], "VND", "PURCHASE", { sourceLineIds })).get(f.variantId);

describe("Nguồn giá mua", () => {
  it("bỏ qua dòng Tester nhập sau", async () => {
    const f = await makeFixture();
    await receive(f, f.mm.id, "A", 100_000);
    await receive(f, f.mm.id, "T", 0, { stockType: "TESTER" });
    expect((await cost(f))?.costVnd).toBe(100_000);
  });

  it("bỏ qua phiếu vào kho bán khác và khu chờ kiểm tra; nhận kho chưa bán (VN)", async () => {
    const f = await makeFixture();
    await receive(f, f.mm.id, "A", 100_000);
    // Kho bán thứ hai cùng kiểu VND (fixture `chi` là MMK nên tạo kho riêng).
    const other = await prisma.location.create({ data: { code: `IT-${f.tag}-MM2`, name: "MM2", type: "MM_STOCK", sellable: true, pricingMode: "VN_IMPORT" } });
    const otherDoc = await prisma.stockDocument.create({
      data: { code: `IT-${f.tag}-X`, type: "RECEIVE", status: "POSTED", toId: other.id, postedAt: new Date(Date.now() + 60_000), createdById: f.userId },
    });
    const batch = await prisma.batch.findFirstOrThrow({ where: { variantId: f.variantId, lotNo: "A" } });
    await prisma.stockDocumentLine.create({ data: { documentId: otherDoc.id, variantId: f.variantId, batchId: batch.id, qty: 1, unitCostVnd: 1 } });
    const qcDoc = await prisma.stockDocument.create({
      data: { code: `IT-${f.tag}-Q`, type: "RECEIVE", status: "POSTED", toId: f.qc.id, postedAt: new Date(Date.now() + 120_000), createdById: f.userId },
    });
    await prisma.stockDocumentLine.create({ data: { documentId: qcDoc.id, variantId: f.variantId, batchId: batch.id, qty: 1, unitCostVnd: 2 } });
    expect((await cost(f))?.costVnd).toBe(100_000);

    await receive(f, f.vn.id, "V", 90_000);
    expect((await cost(f))?.costVnd).toBe(90_000);
  });

  it("lô nhập hai lần khác giá → hai lựa chọn, chọn đúng lần nhập", async () => {
    const f = await makeFixture();
    await receive(f, f.mm.id, "A", 100_000);
    await receive(f, f.mm.id, "A", 120_000);
    const list = (await receiptSources(prisma, [f.variantId])).get(f.variantId)!;
    expect(list.map((s) => [s.lotNo, s.unitCostVnd])).toEqual([["A", 120_000], ["A", 100_000]]);
    expect((await cost(f))?.costVnd).toBe(120_000);
    expect((await cost(f, new Map([[f.variantId, list[1].lineId]])))?.costVnd).toBe(100_000);
    expect(await cost(f, new Map([[f.variantId, "khong-co"]]))).toBeNull();
  });
});
