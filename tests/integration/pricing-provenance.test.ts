import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cancelDocument, createDocument, postDocument } from "@/server/inventory/documents";
import { pricingGaps } from "@/server/pricing/queries";
import { applyRun, cancelRun, createRate, previewRun } from "@/server/pricing/runs";
import { makeFixture, type Fixture } from "./fixtures";

const DAY = 24 * 60 * 60 * 1000;

async function receive(f: Fixture, lot: string, unitCostVnd: number, variantId = f.variantId) {
  const doc = await createDocument(
    { type: "RECEIVE", toId: f.vn.id, lines: [{ variantId, lotNo: lot, expiryDate: "2028-12-31", unitCostVnd, qty: 5 }] },
    f.userId,
  );
  await postDocument(doc.id, f.userId);
  return doc;
}

// Kho mm của fixture là VN_IMPORT: 1 VND = 0.1 MMK, lãi 0%, cước 1,000 MMK/kg, làm tròn 1.
async function vnPreview(f: Fixture, now?: Date) {
  const rate = await createRate({ mmkPerUsd: "2600", vndPerUsd: "26000" }, f.userId);
  return previewRun({ locationId: f.mm.id, rateId: rate.id, marginPct: "0", shipMmkPerKg: 1_000, roundTo: 1, brandId: f.brandId }, f.userId, now);
}
const lineOf = (runId: string, variantId: string) => prisma.priceRunLine.findUniqueOrThrow({ where: { runId_variantId: { runId, variantId } } });

describe("D1 — nguồn giá mua theo phiếu nhập đã ghi sổ", () => {
  it("lô cũ được nhập lại sau lô mới → chọn theo lần ghi sổ gần nhất; dòng lưu lô + phiếu + ngày ghi sổ", async () => {
    const f = await makeFixture();
    await prisma.variant.update({ where: { id: f.variantId }, data: { weightGrams: 100 } });
    await receive(f, "OLD", 50_000);
    await receive(f, "NEW", 100_000);
    const again = await receive(f, "OLD", 50_000); // lô OLD (tạo trước) vừa nhập thêm
    const run = await vnPreview(f);
    const line = await lineOf(run.id, f.variantId);
    const old = await prisma.batch.findUniqueOrThrow({ where: { variantId_lotNo: { variantId: f.variantId, lotNo: "OLD" } } });
    expect(line).toMatchObject({ costVnd: 50_000, sourceBatchId: old.id, sourceDocumentId: again.id, status: "PENDING" });
    expect(line.sourcePostedAt).toBeInstanceOf(Date);
    expect(line.fingerprint).toMatch(/^[0-9a-f]{32}$/);
    expect(run).toMatchObject({ formulaVersion: 2 });
    expect(run.expiresAt!.getTime() - run.createdAt.getTime()).toBe(3 * DAY); // mặc định pricing.previewDays = 3
  });

  it("đầu vào đổi sau xem trước (nhập lô giá khác / sửa khối lượng) → dòng bị bỏ qua INPUT_CHANGED, giá không đổi", async () => {
    const f = await makeFixture();
    await prisma.variant.update({ where: { id: f.variantId }, data: { weightGrams: 100 } });
    await receive(f, "A", 100_000);
    const run = await vnPreview(f);
    expect((await lineOf(run.id, f.variantId)).newPriceMmk).toBe(10_100);
    await receive(f, "B", 120_000);
    const res = await applyRun(run.id, [f.variantId], f.userId);
    expect(res).toMatchObject({ applied: 0, skipped: [{ sku: `IT-${f.tag}`, reason: "INPUT_CHANGED" }], remaining: 0 });
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } })).priceMmk).toBe(10_000);
    expect(await lineOf(run.id, f.variantId)).toMatchObject({ status: "SKIPPED", skipReason: "INPUT_CHANGED" });

    // Phiếu nháp / huỷ sau xem trước không làm dòng mới bị coi là đổi đầu vào.
    const run2 = await vnPreview(f);
    const draft = await createDocument(
      { type: "RECEIVE", toId: f.vn.id, lines: [{ variantId: f.variantId, lotNo: "D", expiryDate: "2028-12-31", unitCostVnd: 999_000, qty: 1 }] },
      f.userId,
    );
    await cancelDocument(draft.id, f.userId);
    expect(await applyRun(run2.id, [f.variantId], f.userId)).toMatchObject({ applied: 1, skipped: [] });
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } })).priceMmk).toBe(12_100);

    await prisma.variant.update({ where: { id: f.variantId }, data: { priceMmk: 10_000 } });
    const run3 = await vnPreview(f);
    await prisma.variant.update({ where: { id: f.variantId }, data: { weightGrams: 300 } });
    expect((await applyRun(run3.id, [f.variantId], f.userId)).skipped).toEqual([{ sku: `IT-${f.tag}`, reason: "INPUT_CHANGED" }]);
  });

  it("áp dụng một phần: bản vẫn mở cho dòng còn chờ; áp nốt → APPLIED; huỷ bản đã áp một phần giữ dòng đã áp", async () => {
    const f = await makeFixture();
    await prisma.variant.update({ where: { id: f.variantId }, data: { weightGrams: 100 } });
    const second = await prisma.variant.create({ data: { productId: f.productId, sku: `IT-${f.tag}-2`, label: "100ml", priceMmk: 5_000, weightGrams: 200 } });
    const third = await prisma.variant.create({ data: { productId: f.productId, sku: `IT-${f.tag}-3`, label: "200ml", priceMmk: 5_000, weightGrams: 300 } });
    await receive(f, "A", 100_000);
    await receive(f, "B", 100_000, second.id);
    await receive(f, "C", 100_000, third.id);

    const run = await vnPreview(f);
    expect(await applyRun(run.id, [f.variantId], f.userId)).toMatchObject({ applied: 1, remaining: 2 });
    expect(await prisma.priceUpdateRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({ status: "PREVIEW" });
    expect(await applyRun(run.id, [second.id], f.userId)).toMatchObject({ applied: 1, remaining: 1 });
    // Dòng đã áp không áp lại được (không còn ở trạng thái chờ).
    expect(await applyRun(run.id, [f.variantId], f.userId)).toMatchObject({ applied: 0, remaining: 1 });
    await cancelRun(run.id, f.userId);
    expect(await lineOf(run.id, f.variantId)).toMatchObject({ status: "APPLIED" });
    expect(await lineOf(run.id, third.id)).toMatchObject({ status: "SKIPPED", skipReason: "CANCELLED" });
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: third.id } })).priceMmk).toBe(5_000);

    const all = await vnPreview(f);
    expect(await applyRun(all.id, [third.id], f.userId)).toMatchObject({ applied: 1, remaining: 0 });
    expect(await prisma.priceUpdateRun.findUniqueOrThrow({ where: { id: all.id } })).toMatchObject({ status: "APPLIED" });
  });

  it("bản quá hạn hoặc tạo trước D1 (formulaVersion 1) không áp dụng được", async () => {
    const f = await makeFixture();
    await prisma.variant.update({ where: { id: f.variantId }, data: { weightGrams: 100 } });
    await receive(f, "A", 100_000);
    const old = await vnPreview(f, new Date(Date.now() - 4 * DAY));
    await expect(applyRun(old.id, [f.variantId], f.userId)).rejects.toThrow(/hết hạn/);
    const legacy = await vnPreview(f);
    await prisma.priceUpdateRun.update({ where: { id: legacy.id }, data: { formulaVersion: 1 } });
    await expect(applyRun(legacy.id, [f.variantId], f.userId)).rejects.toThrow(/cách tính cũ/);
  });

  it("combo: chưa khai báo khối lượng → cộng thành phần; thiếu vốn thành phần → ghi vào danh sách bỏ qua + thiếu vốn", async () => {
    const f = await makeFixture();
    await prisma.variant.update({ where: { id: f.variantId }, data: { weightGrams: 80 } });
    const noCost = await prisma.variant.create({ data: { productId: f.productId, sku: `IT-${f.tag}-NC`, label: "x", priceMmk: 1, weightGrams: 50 } });
    const set = await prisma.variant.create({
      data: { productId: f.productId, sku: `IT-${f.tag}-SET`, label: "Set", priceMmk: 1, isBundle: true, bundleItems: { create: { componentId: f.variantId, qty: 2 } } },
    });
    const broken = await prisma.variant.create({
      data: {
        productId: f.productId,
        sku: `IT-${f.tag}-SET2`,
        label: "Set 2",
        priceMmk: 1,
        isBundle: true,
        weightGrams: 200,
        bundleItems: { create: [{ componentId: f.variantId, qty: 1 }, { componentId: noCost.id, qty: 1 }] },
      },
    });
    await receive(f, "A", 100_000);
    const run = await vnPreview(f);
    // 2 × 100,000 VND × 0.1 + 1,000 MMK/kg × 160 g = 20,160
    expect(await lineOf(run.id, set.id)).toMatchObject({ costVnd: 200_000, weightGrams: 160, weightFromComponents: true, shipMmk: 160, newPriceMmk: 20_160, sourceBatchId: null });
    expect(run.skipped).toEqual(
      expect.arrayContaining([
        { variantId: broken.id, sku: `IT-${f.tag}-SET2`, reason: "NO_COST" },
        { variantId: noCost.id, sku: `IT-${f.tag}-NC`, reason: "NO_COST" },
      ]),
    );
    const gaps = (await pricingGaps()).find((g) => g.location.id === f.mm.id)!;
    expect(gaps.missingCost).toEqual(expect.arrayContaining([`IT-${f.tag}-NC`, `IT-${f.tag}-SET2`]));
    expect(gaps.missingWeight).not.toContain(`IT-${f.tag}-SET`); // khối lượng cộng từ thành phần
  });
});
