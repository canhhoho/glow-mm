import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { toCsv } from "@/lib/csv";
import { commitCatalogImport, previewCatalogImport } from "@/server/catalog/catalog-import";
import { saveProductPricing } from "@/server/catalog/product-pricing";
import { reviewProducts, submitProducts } from "@/server/catalog/review";
import { createDocument, postDocument } from "@/server/inventory/documents";
import { inventoryCost } from "@/server/inventory/cost";
import { receiptSources } from "@/server/pricing/cost";
import { applyManualVnd, applyRun, createRate, previewRun } from "@/server/pricing/runs";
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
    expect(preview.counts.priceChanges).toBe(0);
    await commitCatalogImport(preview.input, f.userId, { allowPricing: false });
    expect((await pending(f))[f.variantId]?.priceMmk).toBe(12_000);
    expect((await variant(f.variantId)).priceMmk).toBe(10_000);
  });

  it("giá = giá đang chờ → không tính là đổi giá; giá khác → cần quyền giá", async () => {
    const f = await ready();
    await approve(f);
    await saveProductPricing({ productId: f.productId, reason: "Tăng", variants: [{ id: f.variantId, priceMmk: 12_000, expectedPriceMmk: 10_000 }] }, f.userId);
    expect((await previewCatalogImport(csv([{ sku: `IT-${f.tag}`, price_mmk: 12000 }]))).counts.priceChanges).toBe(0);
    const p = await previewCatalogImport(csv([{ sku: `IT-${f.tag}`, price_mmk: 13000 }]));
    expect(p.counts.priceChanges).toBe(1);
    await expect(commitCatalogImport(p.input, f.userId)).rejects.toThrow("cần quyền quản lý giá");
  });

  it("hoa hồng qua Excel cho SP đã duyệt chờ duyệt cùng giá, áp cùng lúc", async () => {
    const f = await ready();
    await approve(f);
    const p = await previewCatalogImport(csv([{ sku: `IT-${f.tag}`, price_mmk: 15000, affiliate_commission_mmk: 1500 }]));
    await commitCatalogImport(p.input, f.userId, { allowPricing: true });
    expect(await variant(f.variantId)).toMatchObject({ priceMmk: 10_000, affiliateCommissionMmk: null });
    expect((await pending(f))[f.variantId]).toMatchObject({ priceMmk: 15_000, commission: { value: 1500 } });
    await approve(f);
    expect(await variant(f.variantId)).toMatchObject({ priceMmk: 15_000, affiliateCommissionMmk: 1500 });
    const h = await prisma.priceHistory.findFirstOrThrow({ where: { variantId: f.variantId }, orderBy: { createdAt: "desc" } });
    expect(h).toMatchObject({ oldPriceMmk: 10_000, newPriceMmk: 15_000, oldCommissionMmk: null, newCommissionMmk: 1500 });
  });
});

describe("A4 Phí đưa về kho: 0 = đã biết, trống = chưa biết", () => {
  it("xem trước khớp kết quả ghi sổ", async () => {
    const f = await makeFixture();
    await createRate({ mmkPerUsd: "4420", vndPerUsd: "26000" }, f.userId);
    const sku = `IT-${f.tag}`;
    const p = await previewCatalogImport(
      csv([
        { sku, qty: 2, expiry_date: "2029-12-31", unit_cost: 100000, inbound_unit_vnd: 0, lot_no: "Z0" },
        { sku, qty: 2, expiry_date: "2029-12-31", unit_cost: 100000, lot_no: "ZB" },
      ]),
    );
    expect(p.rows.map((r) => r.stock?.costMmk)).toEqual([17_000, null]);
    const r = await commitCatalogImport(p.input, f.userId);
    await postDocument(r.documents[0].id, f.userId);
    const lots = await prisma.batch.findMany({ where: { variantId: f.variantId }, orderBy: { lotNo: "asc" } });
    expect(lots.map((b) => [b.lotNo, inventoryCost(b).costStatus, inventoryCost(b).unitCostMmk])).toEqual([
      ["Z0", "ACTUAL", 17_000],
      ["ZB", "MISSING", null],
    ]);
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
    await expect(applyManualVnd({ locationId: f.mm.id, rateId: rate.id, lines: [{ ...line, expectedPriceMmk: 9_000 }] }, f.userId)).rejects.toThrow("vừa được đổi");
    const res = await applyManualVnd({ locationId: f.mm.id, rateId: rate.id, lines: [line] }, f.userId);
    expect(res).toMatchObject({ applied: 1, awaitingApproval: 1 });
    const runLine = await prisma.priceRunLine.findFirstOrThrow({ where: { runId: res.runId } });
    expect(runLine).toMatchObject({ costVnd: 100_000, profitVnd: 50_000, sellVnd: 150_000, shipMmk: 800, commissionMmk: 2_000, newPriceMmk: 27_800, sourceLineId: sources[1].lineId });
    expect(await variant(f.variantId)).toMatchObject({ priceMmk: 10_000, affiliateCommissionMmk: null });
    await approve(f);
    expect(await variant(f.variantId)).toMatchObject({ priceMmk: 27_800, affiliateCommissionMmk: 2_000 });
  });

  it("không dùng công thức VND cho kho MMK", async () => {
    const f = await makeFixture();
    const rate = await createRate({ mmkPerUsd: "4500", vndPerUsd: "27000" }, f.userId);
    await expect(applyManualVnd({ locationId: f.chi.id, rateId: rate.id, lines: [{ variantId: f.variantId, profitVnd: 1, shipMmk: 0, commissionMmk: 0, expectedPriceMmk: 10_000, expectedCommissionMmk: "" }] }, f.userId)).rejects.toThrow("kho hàng nhập Việt Nam");
  });
});
