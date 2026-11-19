import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { loadReadiness } from "@/server/catalog/readiness";
import { createDocument, postDocument } from "@/server/inventory/documents";
import { receiptSources } from "@/server/pricing/cost";
import { rateRecalcVariantIds } from "@/server/pricing/rate-recalc";
import { applyManualPricing, createRate, RATE_CONFIRM_REASON } from "@/server/pricing/runs";
import { makeFixture, unpublishTestProducts } from "./fixtures";

afterAll(unpublishTestProducts);

// 18/11/2026 — nút "Tính lại giá theo tỷ giá mới": danh sách = cảnh báo RATE_NEWER; lưu → dòng đổi giá được áp,
// dòng tính ra không đổi được XÁC NHẬN (lịch sử giá cũ = mới) để hết cảnh báo; không xác nhận thì báo "không đổi".
describe("Tính lại giá theo tỷ giá mới", () => {
  it("đổi tỷ giá → SKU vào danh sách; giá không đổi → xác nhận hết cảnh báo; giá đổi → áp giá mới", async () => {
    const f = await makeFixture(); // kho mm = hàng nhập VN, SP chưa duyệt → giá áp thẳng
    const doc = await createDocument({ type: "RECEIVE", toId: f.mm.id, lines: [{ variantId: f.variantId, lotNo: "A", expiryDate: "2029-12-31", unitCostVnd: 100_000, qty: 3 }] }, f.userId);
    await postDocument(doc.id, f.userId);
    const source = (await receiptSources(prisma, [f.variantId])).get(f.variantId)![0].lineId;
    const price = async () => (await prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } })).priceMmk;
    const commission = async () => (await prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } })).affiliateCommissionMmk ?? "";
    const warned = async () => !!(await loadReadiness(prisma, [f.productId])).get(f.productId)!.warnings.find((w) => w.code === "RATE_NEWER");
    const apply = async (rateId: string, confirmUnchanged?: boolean) =>
      applyManualPricing(
        {
          locationId: f.mm.id,
          rateId,
          lines: [{ variantId: f.variantId, sourceLineId: source, profitVnd: 50_000, shipMmk: 800, commissionMmk: 0, expectedPriceMmk: await price(), expectedCommissionMmk: await commission() }],
          ...(confirmUnchanged && { confirmUnchanged: true }),
        },
        f.userId,
      );

    // 1 MMK = 6 VND: (100 000 + 50 000) ÷ 6 + 800 = 25 800.
    const r1 = await createRate({ mmkPerUsd: "4500", vndPerUsd: "27000" }, f.userId);
    await apply(r1.id);
    expect(await price()).toBe(25_800);
    expect(await warned()).toBe(false);

    // Tỷ giá đổi rất ít → làm tròn ra vẫn 25 800: có cảnh báo + nằm trong danh sách tính lại.
    const r2 = await createRate({ mmkPerUsd: "4500", vndPerUsd: "27010" }, f.userId);
    expect(await warned()).toBe(true);
    expect(await rateRecalcVariantIds()).toContain(f.variantId);
    await expect(apply(r2.id)).rejects.toThrow("không đổi");
    expect(await apply(r2.id, true)).toMatchObject({ applied: 0, confirmed: 1, runId: null });
    expect(await price()).toBe(25_800);
    expect(await warned()).toBe(false);
    expect(await rateRecalcVariantIds()).not.toContain(f.variantId);
    expect(await prisma.priceHistory.findFirst({ where: { variantId: f.variantId }, orderBy: { createdAt: "desc" } })).toMatchObject({
      oldPriceMmk: 25_800,
      newPriceMmk: 25_800,
      reason: RATE_CONFIRM_REASON,
    });

    // Tỷ giá đổi đủ lớn: 150 000 ÷ 6.06 + 800 = 25 552,47 → làm tròn lên 25 600 → áp giá mới.
    const r3 = await createRate({ mmkPerUsd: "4500", vndPerUsd: "27270" }, f.userId);
    expect(await warned()).toBe(true);
    expect(await apply(r3.id, true)).toMatchObject({ applied: 1, confirmed: 0 });
    expect(await price()).toBe(25_600);
    expect(await warned()).toBe(false);
  });
});
