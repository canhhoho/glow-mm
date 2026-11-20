import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { toCsv } from "@/lib/csv";
import { commitCatalogImport, previewCatalogImport } from "@/server/catalog/catalog-import";
import { saveProductPricing } from "@/server/catalog/product-pricing";
import { reviewProducts, submitProducts } from "@/server/catalog/review";
import { createDocument, postDocument, updateReceiveDraft } from "@/server/inventory/documents";
import { inventoryCost } from "@/server/inventory/cost";
import { receiptSources } from "@/server/pricing/cost";
import { applyManualPricing, applyRun, createRate, previewRun } from "@/server/pricing/runs";
import { makeFixture, unpublishTestProducts, type Fixture } from "./fixtures";

afterAll(unpublishTestProducts);

// Sửa luồng giá 16/11: Excel giữ giá chờ (A2), phí về kho 0 ≠ trống (A4), hoa hồng ≤ giá (A5), giá + hoa hồng có
// hiệu lực cùng lúc (A6), bảng tính được thay giá chờ, chế độ Thủ công kho VND.

const variant = (id: string) => prisma.variant.findUniqueOrThrow({ where: { id } });
const version = async (f: Fixture) => (await prisma.product.findUniqueOrThrow({ where: { id: f.productId } })).approvalVersion;
const pending = async (f: Fixture) => ((await prisma.productChangeRequest.findUnique({ where: { productId: f.productId } }))?.prices ?? {}) as Record<string, { priceMmk: number; commission?: { value: number | null } }>;
const csv = (rows: Record<string, string | number>[]) => {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return { csv: toCsv([keys, ...rows.map((r) => keys.map((k) => String(r[k] ?? "")))]) };
};

async function receive(f: Fixture, lotNo: string, unitCostVnd: number) {
  const doc = await createDocument({ type: "RECEIVE", toId: f.mm.id, lines: [{ variantId: f.variantId, lotNo, expiryDate: "2029-12-31", unitCostVnd, qty: 3 }] }, f.userId);
  await postDocument(doc.id, f.userId);
  return doc;
}
async function ready() {
  const f = await makeFixture();
  await prisma.product.update({ where: { id: f.productId }, data: { slug: `it-${f.tag.toLowerCase()}` } });
  await prisma.variant.update({ where: { id: f.variantId }, data: { weightGrams: 100 } });
  await receive(f, "A", 100_000);
  return f;
}
async function approve(f: Fixture, publish = false) {
  expect(await submitProducts({ ids: [f.productId] }, f.userId)).toMatchObject([{ ok: true }]);
  expect(await reviewProducts({ decision: publish ? "approvePublish" : "approve", items: [{ id: f.productId, version: await version(f) }] }, f.userId)).toMatchObject([{ ok: true }]);
}

describe("A2 Excel không xoá ngầm, không vượt quyền", () => {
  it("ô giá trống + đổi tên SP đã duyệt → giữ giá chờ duyệt; không cần quyền giá", async () => {
    const f = await ready();
    await approve(f, true);
    await saveProductPricing({ productId: f.productId, reason: "Tăng giá", variants: [{ id: f.variantId, priceMmk: 12_000, expectedPriceMmk: 10_000 }] }, f.userId);
    const preview = await previewCatalogImport(csv([{ sku: `IT-${f.tag}`, name_en: `Tên mới ${f.tag}` }]));
    expect(preview.errors).toEqual([]);
    await commitCatalogImport(preview.input, f.userId);
    expect((await pending(f))[f.variantId]?.priceMmk).toBe(12_000);
    expect((await variant(f.variantId)).priceMmk).toBe(10_000);
  });

  it("file cũ có cột giá / hoa hồng: bỏ qua kèm lưu ý — giá đang bán và giá chờ duyệt giữ nguyên", async () => {
    const f = await ready();
    await approve(f);
    await saveProductPricing({ productId: f.productId, reason: "Tăng", variants: [{ id: f.variantId, priceMmk: 12_000, expectedPriceMmk: 10_000 }] }, f.userId);
    const p = await previewCatalogImport(csv([{ sku: `IT-${f.tag}`, price_mmk: 15000, affiliate_commission_mmk: 1500 }]));
    expect(p.errors).toEqual([]);
    expect(p.warnings.join("\n")).toContain("không còn nhập qua Excel");
    await commitCatalogImport(p.input, f.userId);
    expect(await variant(f.variantId)).toMatchObject({ priceMmk: 10_000, affiliateCommissionMmk: null });
    expect((await pending(f))[f.variantId]?.priceMmk).toBe(12_000);
  });

});

describe("A4 Excel → giá mua hiện tại; giá vốn lô = giá mua × tỷ giá lúc ghi sổ phiếu nhập (không còn phí về kho)", () => {
  it("Excel ghi giá mua + SL dự kiến (không phiếu); phiếu nhập dùng giá đó → giá vốn = giá mua × tỷ giá; cột Phí đưa về kho bị bỏ qua", async () => {
    const f = await makeFixture();
    await createRate({ mmkPerUsd: "4420", vndPerUsd: "26000" }, f.userId);
    await prisma.product.update({ where: { id: f.productId }, data: { slug: `it-${f.tag.toLowerCase()}` } });
    const sku = `IT-${f.tag}`;
    const p = await previewCatalogImport(csv([{ sku, qty: 4, unit_cost: 100000, inbound_unit_vnd: 5000 }]));
    expect(p.errors).toEqual([]);
    expect(p.warnings.join("\n")).toContain("Phí đưa về kho không còn dùng");
    expect(p.rows[0]).toMatchObject({ planned: 4, purchase: { amount: 100000, currency: "VND" } });
    await commitCatalogImport(p.input, f.userId);
    expect(await variant(f.variantId)).toMatchObject({ plannedReceiveQty: 4, purchasePriceVnd: 100000 });
    expect(await prisma.batch.count({ where: { variantId: f.variantId } })).toBe(0);
    // Hàng về: phiếu nhập (giá gợi ý = giá mua hiện tại) → giá vốn 100.000 × 0,17; SL dự kiến về 0.
    const doc = await createDocument({ type: "RECEIVE", toId: f.mm.id, lines: [{ variantId: f.variantId, lotNo: "Z0", unitCostVnd: 100000, qty: 4 }] }, f.userId);
    await postDocument(doc.id, f.userId);
    const lot = await prisma.batch.findFirstOrThrow({ where: { variantId: f.variantId, lotNo: "Z0" } });
    expect(inventoryCost(lot)).toMatchObject({ costStatus: "ACTUAL", unitCostMmk: 17_000 });
    expect((await variant(f.variantId)).plannedReceiveQty).toBe(0);
  });
});

describe("A5/A6 + bảng tính giá", () => {
  it("SP đã duyệt: sửa giá + hoa hồng → cùng chờ duyệt, khách chưa thấy; duyệt → cùng có hiệu lực", async () => {
    const f = await ready();
    await approve(f);
    await saveProductPricing({ productId: f.productId, reason: "Đổi", variants: [{ id: f.variantId, priceMmk: 20_000, affiliateCommissionMmk: 2_000, expectedPriceMmk: 10_000 }] }, f.userId);
    expect(await variant(f.variantId)).toMatchObject({ priceMmk: 10_000, affiliateCommissionMmk: null });
    await approve(f);
    expect(await variant(f.variantId)).toMatchObject({ priceMmk: 20_000, affiliateCommissionMmk: 2_000 });
    // Chỉ đổi hoa hồng: không cần lý do, vẫn chờ duyệt, không tạo lịch sử giá.
    await saveProductPricing({ productId: f.productId, variants: [{ id: f.variantId, priceMmk: 20_000, affiliateCommissionMmk: 2_500 }] }, f.userId);
    expect((await variant(f.variantId)).affiliateCommissionMmk).toBe(2_000);
    await approve(f);
    expect((await variant(f.variantId)).affiliateCommissionMmk).toBe(2_500);
    expect(await prisma.priceHistory.count({ where: { variantId: f.variantId } })).toBe(1);
  });

  it("bảng tính THAY được giá đang chờ; sửa xen giữa → PRICE_CHANGED; hoa hồng > giá mới → bỏ qua", async () => {
    const f = await ready();
    const rate = await createRate({ mmkPerUsd: "4420", vndPerUsd: "26000" }, f.userId);
    await approve(f);
    await saveProductPricing({ productId: f.productId, reason: "Tạm", variants: [{ id: f.variantId, priceMmk: 12_000, expectedPriceMmk: 10_000 }] }, f.userId);
    const run = await previewRun({ locationId: f.mm.id, rateId: rate.id, marginPct: "40", shipMmkPerKg: 8000, roundTo: 100, variantIds: [f.variantId] }, f.userId);
    expect(await prisma.priceRunLine.findFirstOrThrow({ where: { runId: run.id } })).toMatchObject({ oldPriceMmk: 10_000, basePriceMmk: 12_000, newPriceMmk: 24_600 });
    expect(await applyRun(run.id, [f.variantId], f.userId)).toMatchObject({ applied: 1, awaitingApproval: 1 });
    expect((await pending(f))[f.variantId]?.priceMmk).toBe(24_600);

    const run2 = await previewRun({ locationId: f.mm.id, rateId: rate.id, marginPct: "50", shipMmkPerKg: 8000, roundTo: 100, variantIds: [f.variantId] }, f.userId);
    await saveProductPricing({ productId: f.productId, reason: "Xen", variants: [{ id: f.variantId, priceMmk: 30_000 }] }, f.userId);
    expect((await applyRun(run2.id, [f.variantId], f.userId)).skipped).toEqual([{ sku: `IT-${f.tag}`, reason: "PRICE_CHANGED" }]);

    await saveProductPricing({ productId: f.productId, reason: "Hoa hồng cao", variants: [{ id: f.variantId, priceMmk: 30_000, affiliateCommissionMmk: 25_000 }] }, f.userId);
    const run3 = await previewRun({ locationId: f.mm.id, rateId: rate.id, marginPct: "40", shipMmkPerKg: 8000, roundTo: 100, variantIds: [f.variantId] }, f.userId);
    expect((await applyRun(run3.id, [f.variantId], f.userId)).skipped).toEqual([{ sku: `IT-${f.tag}`, reason: "COMMISSION_OVER_PRICE" }]);
  });
});

describe("Thủ công kho VND", () => {
  it("27.800 = (100.000 + 50.000) ÷ 6 + 800 + 2.000; chọn đúng lần nhập; chờ duyệt rồi có hiệu lực cùng hoa hồng", async () => {
    const f = await ready();
    await receive(f, "A", 130_000); // cùng lô, lần nhập sau khác giá
    const rate = await createRate({ mmkPerUsd: "4500", vndPerUsd: "27000" }, f.userId); // 1 MMK = 6 VND
    await approve(f, true);
    const sources = (await receiptSources(prisma, [f.variantId])).get(f.variantId)!;
    expect(sources.map((s) => s.unitCostVnd)).toEqual([130_000, 100_000]);
    const line = { variantId: f.variantId, sourceLineId: sources[1].lineId, profitVnd: 50_000, shipMmk: 800, commissionMmk: 2_000, expectedPriceMmk: 10_000, expectedCommissionMmk: "" };
    await expect(applyManualPricing({ locationId: f.mm.id, rateId: rate.id, lines: [{ ...line, expectedPriceMmk: 9_000 }] }, f.userId)).rejects.toThrow("vừa được đổi");
    const res = await applyManualPricing({ locationId: f.mm.id, rateId: rate.id, lines: [line] }, f.userId);
    expect(res).toMatchObject({ applied: 1, awaitingApproval: 1 });
    const runLine = await prisma.priceRunLine.findFirstOrThrow({ where: { runId: res.runId! } });
    expect(runLine).toMatchObject({ costVnd: 100_000, profitVnd: 50_000, sellVnd: 150_000, shipMmk: 800, commissionMmk: 2_000, newPriceMmk: 27_800, sourceLineId: sources[1].lineId });
    expect(await variant(f.variantId)).toMatchObject({ priceMmk: 10_000, affiliateCommissionMmk: null });
    await approve(f);
    expect(await variant(f.variantId)).toMatchObject({ priceMmk: 27_800, affiliateCommissionMmk: 2_000 });
  });

  it("kho Chi (mua tại Myanmar): giá = giá mua MMK + lãi MMK + CTV, không tỷ giá, không vận chuyển; sửa giá mua ngay trên trang", async () => {
    const f = await makeFixture();
    await prisma.product.update({ where: { id: f.productId }, data: { stockLocationId: f.chi.id } });
    // Thiếu lãi MMK (gửi lãi VND) → báo đúng loại tiền.
    await expect(applyManualPricing({ locationId: f.chi.id, lines: [{ variantId: f.variantId, purchase: 15_000, profitVnd: 1, commissionMmk: 0, expectedPriceMmk: 10_000, expectedCommissionMmk: "" }] }, f.userId)).rejects.toThrow("nhập lãi (MMK)");
    // SP chưa có hàng: giá mua nhập tay 15.000 + lãi 5.000 + CTV 1.000 = 21.000 (bội số làm tròn mặc định).
    const res = await applyManualPricing({ locationId: f.chi.id, lines: [{ variantId: f.variantId, purchase: 15_000, profitMmk: 5_000, commissionMmk: 1_000, expectedPriceMmk: 10_000, expectedCommissionMmk: "" }] }, f.userId);
    expect(res.applied).toBe(1);
    const runLine = await prisma.priceRunLine.findFirstOrThrow({ where: { runId: res.runId! } });
    expect(runLine).toMatchObject({ costMmk: 15_000, profitMmk: 5_000, costVnd: null, shipMmk: null, sellVnd: null, commissionMmk: 1_000, newPriceMmk: 21_000, sourceLineId: null });
    expect(await prisma.priceUpdateRun.findUniqueOrThrow({ where: { id: res.runId! } })).toMatchObject({ rateId: null, mode: "MANUAL" });
    expect(await prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } })).toMatchObject({ purchasePriceMmk: 15_000, purchasePriceVnd: null });
  });

  it("kho nhập VN, SP chưa có hàng: nhập giá mua hiện tại trên trang → tính được giá (không cần phiếu nhập)", async () => {
    const f = await makeFixture();
    const rate = await createRate({ mmkPerUsd: "4500", vndPerUsd: "27000" }, f.userId); // 6 VND / MMK
    const line = { variantId: f.variantId, purchase: 120_000, profitVnd: 30_000, shipMmk: 800, commissionMmk: 2_000, expectedPriceMmk: 10_000, expectedCommissionMmk: "" };
    const res = await applyManualPricing({ locationId: f.mm.id, rateId: rate.id, lines: [line] }, f.userId);
    expect(res.applied).toBe(1);
    // (120.000 + 30.000) ÷ 6 = 25.000 + 800 + 2.000 = 27.800.
    expect(await prisma.priceRunLine.findFirstOrThrow({ where: { runId: res.runId! } })).toMatchObject({ costVnd: 120_000, profitVnd: 30_000, newPriceMmk: 27_800, sourceLineId: null });
    expect(await prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } })).toMatchObject({ purchasePriceVnd: 120_000 });
    // Kho nhập VN vẫn bắt buộc tỷ giá.
    await expect(applyManualPricing({ locationId: f.mm.id, lines: [line] }, f.userId)).rejects.toThrow("Tỷ giá");
  });
});

describe("A3 Sửa phiếu nhập nháp giữ dữ liệu", () => {
  // Phiếu nháp cũ có dòng đã chốt tỷ giá (trước 19/11/2026 Excel tạo phiếu nháp và chốt tỷ giá) — dữ liệu còn trong DB.
  it("lưu lại không đổi → giữ giá mua + tỷ giá đã chốt của phiếu nháp cũ; đổi giá → chốt lại khi ghi sổ", async () => {
    const f = await makeFixture();
    const rate = await createRate({ mmkPerUsd: "4420", vndPerUsd: "26000" }, f.userId);
    const draft = await createDocument(
      {
        type: "RECEIVE",
        toId: f.mm.id,
        lines: [
          { variantId: f.variantId, lotNo: "E5", expiryDate: "2029-12-31", unitCostVnd: 100000, qty: 2 },
          { variantId: f.variantId, lotNo: "E9", expiryDate: "2029-12-31", unitCostVnd: 90000, qty: 1 },
        ],
      },
      f.userId,
    );
    const docId = draft.id;
    await prisma.stockDocumentLine.updateMany({ where: { documentId: docId }, data: { rateId: rate.id } });
    const lines = async () =>
      (await prisma.stockDocumentLine.findMany({ where: { documentId: docId }, include: { batch: true }, orderBy: { batch: { lotNo: "asc" } } })).map((l) => ({
        lot: l.batch!.lotNo,
        unitCostVnd: l.unitCostVnd,
        landedCostVnd: l.landedCostVnd,
        rate: l.rateId === rate.id,
      }));
    expect(await lines()).toEqual([
      { lot: "E5", unitCostVnd: 100_000, landedCostVnd: null, rate: true },
      { lot: "E9", unitCostVnd: 90_000, landedCostVnd: null, rate: true },
    ]);
    // Payload giống form sửa: giá của chính dòng (E5), đổi giá E9 (đã có tỷ giá mới hơn).
    await createRate({ mmkPerUsd: "4680", vndPerUsd: "26000" }, f.userId);
    await updateReceiveDraft(
      docId,
      {
        type: "RECEIVE",
        toId: f.mm.id,
        lines: [
          { variantId: f.variantId, lotNo: "E5", expiryStatus: "DATED", expiryDate: "2029-12-31", unitCostVnd: "100000", qty: 2 },
          { variantId: f.variantId, lotNo: "E9", expiryStatus: "DATED", expiryDate: "2029-12-31", unitCostVnd: "95000", qty: 1 },
        ],
      },
      f.userId,
    );
    expect(await lines()).toEqual([
      { lot: "E5", unitCostVnd: 100_000, landedCostVnd: null, rate: true },
      { lot: "E9", unitCostVnd: 95_000, landedCostVnd: null, rate: false },
    ]);
    await postDocument(docId, f.userId);
    const e5 = await prisma.batch.findFirstOrThrow({ where: { variantId: f.variantId, lotNo: "E5" } });
    expect(inventoryCost(e5)).toMatchObject({ costStatus: "ACTUAL", unitCostMmk: 17_000 }); // 100.000 × 0,17 (tỷ giá đã chốt)
    const e9 = await prisma.batch.findFirstOrThrow({ where: { variantId: f.variantId, lotNo: "E9" } });
    expect(inventoryCost(e9)).toMatchObject({ costStatus: "ACTUAL", unitCostMmk: 17_100 }); // 95.000 × 0,18 (tỷ giá mới chốt lúc ghi sổ)
  });
});

describe("Duyệt luôn an toàn", () => {
  it("SP đã có thay đổi từ trước → không nằm trong nhóm được duyệt luôn; SP chỉ có thay đổi của lượt → được", async () => {
    const a = await ready();
    const b = await ready();
    const rate = await createRate({ mmkPerUsd: "4420", vndPerUsd: "26000" }, a.userId);
    await approve(a);
    await approve(b);
    // a: đã có giá chờ từ trước lượt; b: không.
    await saveProductPricing({ productId: a.productId, reason: "Cũ", variants: [{ id: a.variantId, priceMmk: 12_000, expectedPriceMmk: 10_000 }] }, a.userId);
    const run = await previewRun({ locationId: a.mm.id, rateId: rate.id, marginPct: "40", shipMmkPerKg: 8000, roundTo: 100, variantIds: [a.variantId] }, a.userId);
    const runB = await previewRun({ locationId: b.mm.id, rateId: rate.id, marginPct: "40", shipMmkPerKg: 8000, roundTo: 100, variantIds: [b.variantId] }, b.userId);
    const resA = await applyRun(run.id, [a.variantId], a.userId, new Date(), { submit: true });
    const resB = await applyRun(runB.id, [b.variantId], b.userId, new Date(), { submit: true });
    expect(resA.review?.needsReview?.map((r) => r.id)).toEqual([a.productId]);
    expect(resB.review?.needsReview).toEqual([]);
    expect(resB.review?.versions?.[b.productId]).toBe(await version(b));
  });
});
