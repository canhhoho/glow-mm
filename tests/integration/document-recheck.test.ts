import { describe, expect, it, vi } from "vitest";
// Kiểm quy tắc hạn dùng → chạy với cờ hạn dùng BẬT (production đang tắt, 17/11/2026; hành vi tắt: expiry-off.test.ts).
vi.mock("@/lib/features", async (orig) => (await import("../support/expiry-on")).expiryOn(orig));
import { prisma } from "@/lib/db";
import { moveProductsToWarehouse } from "@/server/catalog/product-delete";
import { createDocument, postDocument } from "@/server/inventory/documents";
import { balance, makeFixture } from "./fixtures";

// P1-B (M3): phiếu nháp được kiểm lại lúc ghi sổ; không chuyển lô hết hạn / chưa biết hạn vào kho bán.

describe("Ghi sổ phiếu kho: kiểm lại lúc ghi sổ", () => {
  it("SP đổi kho sau khi lập phiếu nhập nháp → ghi sổ báo lỗi, phiếu vẫn nháp", async () => {
    const f = await makeFixture();
    const doc = await createDocument({ type: "RECEIVE", toId: f.mm.id, lines: [{ variantId: f.variantId, lotNo: "A", expiryDate: "2029-12-31", unitCostVnd: 1000, qty: 2 }] }, f.userId);
    await moveProductsToWarehouse([f.productId], f.chi.id, f.userId);
    await expect(postDocument(doc.id, f.userId)).rejects.toThrow(/không nhập vào/);
    expect((await prisma.stockDocument.findUniqueOrThrow({ where: { id: doc.id } })).status).toBe("DRAFT");
  });

  it("lô chưa biết hạn không chuyển vào kho bán; chuyển sang khu chờ kiểm tra vẫn được", async () => {
    const f = await makeFixture();
    const rc = await createDocument({ type: "RECEIVE", toId: f.vn.id, lines: [{ variantId: f.variantId, lotNo: "U", expiryStatus: "UNKNOWN", unitCostVnd: 1000, qty: 3 }] }, f.userId);
    await postDocument(rc.id, f.userId);
    const lot = await prisma.batch.findFirstOrThrow({ where: { variantId: f.variantId, lotNo: "U" } });

    const toSale = await createDocument({ type: "TRANSFER", fromId: f.vn.id, toId: f.mm.id, lines: [{ variantId: f.variantId, batchId: lot.id, qty: 1 }] }, f.userId);
    await expect(postDocument(toSale.id, f.userId)).rejects.toThrow(/chưa biết hạn/);

    const toQc = await createDocument({ type: "TRANSFER", fromId: f.vn.id, toId: f.qc.id, lines: [{ variantId: f.variantId, batchId: lot.id, qty: 1 }] }, f.userId);
    await postDocument(toQc.id, f.userId);
    expect(await balance(lot.id, f.qc.id)).toBe(1);
  });
});
