import { describe, expect, it } from "vitest";
import { createDocument } from "@/server/inventory/documents";
import { listDocuments } from "@/server/inventory/queries";
import { yangonDayKey } from "@/lib/time";
import { makeFixture } from "./fixtures";

// 20/11/2026 (audit #3): danh sách phiếu kho tìm theo mã / SKU / lý do, lọc loại + ngày, phân trang (trước: cắt 200 phiếu).
describe("danh sách phiếu kho: tìm, lọc, phân trang", () => {
  it("tìm theo SKU / lý do / mã phiếu, lọc loại và ngày, trang vượt quá bị kẹp", async () => {
    const f = await makeFixture();
    const sku = `IT-${f.tag}`;
    const doc = await createDocument({ type: "RECEIVE", toId: f.mm.id, reason: `Lý do ${f.tag}`, lines: [{ variantId: f.variantId, lotNo: "DL1", unitCostVnd: 1000, qty: 2 }] }, f.userId);

    const bySku = await listDocuments({ status: "DRAFT", q: sku });
    expect(bySku.rows.map((d) => d.id)).toEqual([doc.id]);
    expect((await listDocuments({ status: "DRAFT", q: `lý do ${f.tag}` })).rows.map((d) => d.id)).toEqual([doc.id]);
    expect((await listDocuments({ status: "DRAFT", q: doc.code })).rows.map((d) => d.id)).toContain(doc.id);
    expect((await listDocuments({ status: "DRAFT", q: sku, type: "ISSUE" })).total).toBe(0);
    expect((await listDocuments({ status: "POSTED", q: sku })).total).toBe(0);

    const today = yangonDayKey(new Date());
    expect((await listDocuments({ status: "DRAFT", q: sku, from: today, to: today })).total).toBe(1);
    expect((await listDocuments({ status: "DRAFT", q: sku, from: "2000-01-01", to: "2000-01-02" })).total).toBe(0);
    // Ngày nhập ngược → tự đảo; ngày sai định dạng → bỏ qua.
    expect((await listDocuments({ status: "DRAFT", q: sku, from: today, to: "2000-01-01" })).total).toBe(1);
    expect((await listDocuments({ status: "DRAFT", q: sku, from: "x" })).total).toBe(1);

    const far = await listDocuments({ status: "DRAFT", q: sku, page: 99 });
    expect(far).toMatchObject({ page: 1, pageCount: 1, total: 1 });
  });
});
