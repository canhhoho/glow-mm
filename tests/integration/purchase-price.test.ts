import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { loadReadiness } from "@/server/catalog/readiness";
import { createDocument, postDocument } from "@/server/inventory/documents";
import { variantCosts } from "@/server/pricing/cost";
import { PurchasePriceError, setPurchasePrices } from "@/server/pricing/purchase-price";
import { makeFixture, unpublishTestProducts } from "./fixtures";

afterAll(unpublishTestProducts);

// 19/11/2026 — giá mua hiện tại của phân loại (phương án A): một đường ghi, tiền theo kho, tự cập nhật khi ghi sổ phiếu nhập,
// là nguồn giá mua mặc định để tính giá bán (kể cả SP chưa có hàng), và đổi giá mua → nhắc tính lại giá (PRICE_STALE).
describe("Giá mua hiện tại của phân loại", () => {
  it("tiền theo kho: kho nhập VN nhận VND, kho Myanmar nhận MMK; chưa có kho → báo gán kho", async () => {
    const f = await makeFixture();
    // SP fixture thuộc kho `mm` (VN_IMPORT).
    expect(await prisma.$transaction((tx) => setPurchasePrices(tx, [{ variantId: f.variantId, currency: "VND", amount: 120_000 }], { userId: f.userId, source: "manual" }))).toBe(1);
    const v = await prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } });
    expect(v).toMatchObject({ purchasePriceVnd: 120_000, purchasePriceMmk: null });
    expect(v.purchasePriceAt).toBeInstanceOf(Date);
    await expect(prisma.$transaction((tx) => setPurchasePrices(tx, [{ variantId: f.variantId, currency: "MMK", amount: 15_000 }], { userId: f.userId, source: "manual" }))).rejects.toThrow(PurchasePriceError);

    // Kho Chi (LOCAL_MMK): nhận MMK.
    await prisma.product.update({ where: { id: f.productId }, data: { stockLocationId: f.chi.id } });
    await prisma.$transaction((tx) => setPurchasePrices(tx, [{ variantId: f.variantId, currency: "MMK", amount: 15_000 }], { userId: f.userId, source: "manual" }));
    expect(await prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } })).toMatchObject({ purchasePriceMmk: 15_000 });

    // Chưa có kho bán → không biết VND hay MMK.
    await prisma.product.update({ where: { id: f.productId }, data: { stockLocationId: null } });
    await expect(prisma.$transaction((tx) => setPurchasePrices(tx, [{ variantId: f.variantId, currency: "VND", amount: 1 }], { userId: f.userId, source: "import" }))).rejects.toThrow("chưa có kho bán");
    const logs = await prisma.auditLog.count({ where: { action: "variant.purchase_price", entityId: f.variantId } });
    expect(logs).toBe(2);
  });

  it("SP chưa có hàng: giá bán tính từ giá mua hiện tại; ghi sổ phiếu nhập → giá mua = giá lần nhập; chọn lô cụ thể vẫn dùng lô", async () => {
    const f = await makeFixture();
    expect((await variantCosts(prisma, [f.variantId], "VND", "PURCHASE")).get(f.variantId)).toBeNull(); // chưa có gì
    await prisma.$transaction((tx) => setPurchasePrices(tx, [{ variantId: f.variantId, currency: "VND", amount: 100_000 }], { userId: f.userId, source: "manual" }));
    expect((await variantCosts(prisma, [f.variantId], "VND", "PURCHASE")).get(f.variantId)).toMatchObject({ costVnd: 100_000, purchase: true });

    const doc = await createDocument({ type: "RECEIVE", toId: f.mm.id, lines: [{ variantId: f.variantId, lotNo: `PP${f.tag}`, unitCostVnd: 110_000, qty: 3 }] }, f.userId);
    await postDocument(doc.id, f.userId);
    const v = await prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } });
    expect(v.purchasePriceVnd).toBe(110_000);
    expect((await variantCosts(prisma, [f.variantId], "VND", "PURCHASE")).get(f.variantId)).toMatchObject({ costVnd: 110_000, source: { lotNo: `PP${f.tag}` } }); // đồng bộ từ phiếu → giữ truy vết lô

    // Sửa tay sau đó (nhà cung cấp báo giá mới) → giá mua mới là nguồn mặc định; chọn đúng lần nhập → dùng giá lần nhập.
    await prisma.$transaction((tx) => setPurchasePrices(tx, [{ variantId: f.variantId, currency: "VND", amount: 125_000 }], { userId: f.userId, source: "manual" }));
    expect((await variantCosts(prisma, [f.variantId], "VND", "PURCHASE")).get(f.variantId)?.costVnd).toBe(125_000);
    const line = await prisma.stockDocumentLine.findFirstOrThrow({ where: { documentId: doc.id } });
    expect((await variantCosts(prisma, [f.variantId], "VND", "PURCHASE", { sourceLineIds: new Map([[f.variantId, line.id]]) })).get(f.variantId)).toMatchObject({ costVnd: 110_000, source: { lineId: line.id } });
  });

  it("kho Chi: phiếu nhập MMK cập nhật giá mua MMK; không đụng giá VND", async () => {
    const f = await makeFixture();
    await prisma.product.update({ where: { id: f.productId }, data: { stockLocationId: f.chi.id } });
    const doc = await createDocument({ type: "RECEIVE", toId: f.chi.id, lines: [{ variantId: f.variantId, lotNo: `PM${f.tag}`, unitCostMmk: 18_000, qty: 2 }] }, f.userId);
    await postDocument(doc.id, f.userId);
    expect(await prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } })).toMatchObject({ purchasePriceMmk: 18_000, purchasePriceVnd: null });
    expect((await variantCosts(prisma, [f.variantId], "MMK")).get(f.variantId)).toMatchObject({ costVnd: 18_000, source: { lotNo: `PM${f.tag}` } });
  });

  it("đổi giá mua sau lần đặt giá → cảnh báo PRICE_STALE (nhắc tính lại giá)", async () => {
    const f = await makeFixture();
    await prisma.priceHistory.create({ data: { variantId: f.variantId, oldPriceMmk: 0, newPriceMmk: 10_000, reason: "manual: test", userId: f.userId, createdAt: new Date(Date.now() - 60_000) } });
    const stale = async () => (await loadReadiness(prisma, [f.productId])).get(f.productId)!.warnings.some((w) => w.code === "PRICE_STALE");
    expect(await stale()).toBe(false);
    await prisma.$transaction((tx) => setPurchasePrices(tx, [{ variantId: f.variantId, currency: "VND", amount: 99_000 }], { userId: f.userId, source: "manual" }));
    expect(await stale()).toBe(true);
  });
});
