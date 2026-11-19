import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getProductForEdit } from "@/server/catalog/admin-queries";
import { saveProduct } from "@/server/catalog/products";
import { createDocument, postDocument } from "@/server/inventory/documents";
import { applyManualPricing, applyRun, createRate, previewRun } from "@/server/pricing/runs";
import { makeFixture, unpublishTestProducts, type Fixture } from "./fixtures";

/**
 * R1 (docs/ban-do-nghiep-vu-admin.md): các đường ghi giá LIVE (SP chưa duyệt) dùng chung `writeLivePrice` /
 * `recordPriceChange` (`catalog/price-write.ts`). Đường Giá bán MMK + đường duyệt đã có test ở product-pricing /
 * pricing-flow; file này phủ bảng tính, thủ công VND và Excel (`saveProduct`) trên SP chưa duyệt.
 */

afterAll(unpublishTestProducts);

const variant = (id: string) => prisma.variant.findUniqueOrThrow({ where: { id } });
const history = (variantId: string) =>
  prisma.priceHistory.findMany({
    where: { variantId },
    orderBy: { createdAt: "asc" },
    select: { oldPriceMmk: true, newPriceMmk: true, oldCommissionMmk: true, newCommissionMmk: true, reason: true, runId: true },
  });

async function ready() {
  const f = await makeFixture();
  await prisma.product.update({ where: { id: f.productId }, data: { slug: `it-${f.tag.toLowerCase()}` } });
  await prisma.variant.update({ where: { id: f.variantId }, data: { weightGrams: 100 } });
  const doc = await createDocument({ type: "RECEIVE", toId: f.mm.id, lines: [{ variantId: f.variantId, lotNo: "A", expiryDate: "2029-12-31", unitCostVnd: 100_000, qty: 3 }] }, f.userId);
  await postDocument(doc.id, f.userId);
  return f;
}
const rateOf = (f: Fixture) => createRate({ mmkPerUsd: "4420", vndPerUsd: "26000" }, f.userId);

describe("Ghi giá live — SP chưa duyệt", () => {
  it("bảng tính: ghi thẳng, lịch sử 'bulk' + runId; giá đổi sau xem trước → PRICE_CHANGED, không ghi", async () => {
    const f = await ready();
    const rate = await rateOf(f);
    const preview = () => previewRun({ locationId: f.mm.id, rateId: rate.id, marginPct: "40", shipMmkPerKg: 8000, roundTo: 100, variantIds: [f.variantId] }, f.userId);
    const run = await preview();
    expect(await applyRun(run.id, [f.variantId], f.userId)).toMatchObject({ applied: 1, awaitingApproval: 0 });
    expect((await variant(f.variantId)).priceMmk).toBe(24_600);
    expect(await history(f.variantId)).toEqual([{ oldPriceMmk: 10_000, newPriceMmk: 24_600, oldCommissionMmk: null, newCommissionMmk: null, reason: "bulk", runId: run.id }]);

    await prisma.variant.update({ where: { id: f.variantId }, data: { priceMmk: 11_000 } });
    const run2 = await previewRun({ locationId: f.mm.id, rateId: rate.id, marginPct: "50", shipMmkPerKg: 8000, roundTo: 100, variantIds: [f.variantId] }, f.userId);
    await prisma.variant.update({ where: { id: f.variantId }, data: { priceMmk: 12_000 } });
    expect((await applyRun(run2.id, [f.variantId], f.userId)).skipped).toEqual([{ sku: `IT-${f.tag}`, reason: "PRICE_CHANGED" }]);
    expect((await variant(f.variantId)).priceMmk).toBe(12_000);
    expect(await prisma.priceHistory.count({ where: { variantId: f.variantId } })).toBe(1);
  });

  it("thủ công VND: giá + hoa hồng ghi thẳng cùng lúc, lịch sử có hoa hồng; giá đang thấy khác → lỗi", async () => {
    const f = await ready();
    const rate = await rateOf(f);
    const line = { variantId: f.variantId, profitVnd: 50_000, shipMmk: 800, commissionMmk: 2_000, expectedPriceMmk: 10_000, expectedCommissionMmk: null };
    const res = await applyManualPricing({ locationId: f.mm.id, rateId: rate.id, lines: [line] }, f.userId);
    expect(res).toMatchObject({ applied: 1, awaitingApproval: 0 });
    const v = await variant(f.variantId);
    expect(v.affiliateCommissionMmk).toBe(2_000);
    expect(await history(f.variantId)).toEqual([
      { oldPriceMmk: 10_000, newPriceMmk: v.priceMmk, oldCommissionMmk: null, newCommissionMmk: 2_000, reason: "bulk", runId: res.runId },
    ]);
    await expect(applyManualPricing({ locationId: f.mm.id, rateId: rate.id, lines: [{ ...line, profitVnd: 60_000 }] }, f.userId)).rejects.toThrow(/vừa được đổi/);
  });

  it("Excel (saveProduct có giá): lịch sử theo lý do import, ghi cả hoa hồng đổi; giá 0 lưu nháp được; hoa hồng > giá bị chặn", async () => {
    const f = await ready();
    const form = (await getProductForEdit(f.productId))!;
    const withVariant = (patch: Record<string, unknown>) => ({ ...form, variants: form.variants.map((v) => ({ ...v, ...patch })) });

    await saveProduct(withVariant({ priceMmk: 18_000, affiliateCommissionMmk: 1_500 }), f.userId, undefined, { priceReason: "import:abcd1234" });
    expect(await variant(f.variantId)).toMatchObject({ priceMmk: 18_000, affiliateCommissionMmk: 1_500 });
    // R1: trước đây đường này không ghi hoa hồng vào lịch sử giá (các đường khác có) — nay thống nhất.
    expect(await history(f.variantId)).toEqual([
      { oldPriceMmk: 10_000, newPriceMmk: 18_000, oldCommissionMmk: null, newCommissionMmk: 1_500, reason: "import:abcd1234", runId: null },
    ]);

    await expect(saveProduct(withVariant({ priceMmk: 18_000, affiliateCommissionMmk: 20_000 }), f.userId)).rejects.toThrow(/lớn hơn giá bán/);
    // SP chưa đăng: giá 0 = nháp (Excel thêm SKU chưa có giá), hoa hồng không kiểm khi giá 0.
    await saveProduct(withVariant({ priceMmk: 0 }), f.userId, undefined, { priceReason: "import:abcd1234" });
    expect((await variant(f.variantId)).priceMmk).toBe(0);
    expect(await prisma.priceHistory.count({ where: { variantId: f.variantId } })).toBe(2);
  });
});
