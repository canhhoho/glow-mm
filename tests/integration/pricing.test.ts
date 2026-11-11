import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { prisma } from "@/lib/db";
import { cancelDocument, createDocument, postDocument } from "@/server/inventory/documents";
import { pricingGaps } from "@/server/pricing/queries";
import { applyRun, cancelRun, createRate, previewRun } from "@/server/pricing/runs";
import { getAllSettings, getNumberSetting, saveSettings } from "@/server/settings";
import { makeFixture, type Fixture } from "./fixtures";

async function receiveLot(f: Fixture, lot: string, unitCostVnd: number, variantId = f.variantId) {
  const doc = await createDocument(
    { type: "RECEIVE", toId: f.vn.id, lines: [{ variantId, lotNo: lot, expiryDate: "2028-12-31", unitCostVnd, qty: 5 }] },
    f.userId,
  );
  await postDocument(doc.id, f.userId);
  return prisma.batch.findUniqueOrThrow({ where: { variantId_lotNo: { variantId, lotNo: lot } } });
}

const linesOf = (runId: string) => prisma.priceRunLine.findMany({ where: { runId } });

describe("Tính giá theo kho (P24)", () => {
  it("Kho hàng nhập VN: vốn VND × tỷ giá × (1 + %) + ship/kg × khối lượng; thiếu khối lượng bị bỏ qua", async () => {
    const f = await makeFixture();
    await receiveLot(f, "A", 100_000);
    const rate = await createRate({ mmkPerUsd: "4420", vndPerUsd: "26000" }, f.userId); // 1 VND = 0.17 MMK
    await expect(previewRun({ locationId: f.mm.id, rateId: rate.id, marginPct: "30", shipMmkPerKg: 8_000 }, f.userId)).rejects.toThrow(/đủ dữ liệu/);

    await prisma.variant.update({ where: { id: f.variantId }, data: { weightGrams: 80 } });
    await expect(previewRun({ locationId: f.mm.id, rateId: rate.id, marginPct: "30" }, f.userId)).rejects.toThrow(/phí ship/);
    const run = await previewRun({ locationId: f.mm.id, rateId: rate.id, marginPct: "30", shipMmkPerKg: 8_000, roundTo: 100 }, f.userId);
    expect(run).toMatchObject({ locationId: f.mm.id, shipMmkPerKg: 8_000 });
    expect(await linesOf(run.id)).toEqual([
      expect.objectContaining({ variantId: f.variantId, costVnd: 100_000, shipMmk: 640, newPriceMmk: 22_800 }),
    ]);
    // Allocating actual shipment expenses must not add the same freight to the selling price again.
    await prisma.batch.updateMany({ where: { variantId: f.variantId }, data: { landedCostVnd: 120_000, landedCostMmk: 20_400 } });
    const after = await previewRun({ locationId: f.mm.id, rateId: rate.id, marginPct: "30", shipMmkPerKg: 8_000, roundTo: 100 }, f.userId);
    expect(await linesOf(after.id)).toEqual([
      expect.objectContaining({ variantId: f.variantId, costVnd: 100_000, shipMmk: 640, newPriceMmk: 22_800 }),
    ]);
    const bundle = await prisma.variant.create({ data: {
      productId: f.productId, sku: `IT-${f.tag}-SET`, label: "Set", priceMmk: 1, isBundle: true, weightGrams: 160,
      bundleItems: { create: { componentId: f.variantId, qty: 2 } },
    } });
    const comboRun = await previewRun({ locationId: f.mm.id, rateId: rate.id, marginPct: "30", shipMmkPerKg: 8000, roundTo: 100 }, f.userId);
    expect((await linesOf(comboRun.id)).find((l) => l.variantId === bundle.id)).toMatchObject({ costVnd: 200_000, shipMmk: 1280, newPriceMmk: 45_500 });
  });

  it("Kho mua MMK: lô giá MMK có giá vốn MMK ngay; giá = vốn MMK + lãi cố định; sai loại tiền bị chặn", async () => {
    const f = await makeFixture();
    await prisma.product.update({ where: { id: f.productId }, data: { stockLocationId: f.chi.id } });
    // Kho Chi nhập giá MMK; nhập VND bị chặn.
    await expect(
      createDocument({ type: "RECEIVE", toId: f.chi.id, lines: [{ variantId: f.variantId, lotNo: "X", expiryDate: "2028-12-31", unitCostVnd: 1, qty: 1 }] }, f.userId),
    ).rejects.toThrow(/nhập giá mua bằng MMK/);
    const doc = await createDocument(
      { type: "RECEIVE", toId: f.chi.id, lines: [{ variantId: f.variantId, lotNo: "M1", expiryDate: "2028-12-31", unitCostMmk: 18_250, qty: 3 }] },
      f.userId,
    );
    await postDocument(doc.id, f.userId);
    const batch = await prisma.batch.findUniqueOrThrow({ where: { variantId_lotNo: { variantId: f.variantId, lotNo: "M1" } } });
    expect(batch).toMatchObject({ unitCostVnd: null, unitCostMmk: 18_250, landedCostMmk: 18_250, rateId: null });

    await expect(previewRun({ locationId: f.chi.id }, f.userId)).rejects.toThrow(/đủ dữ liệu/); // chưa có lãi cố định
    await prisma.product.update({ where: { id: f.productId }, data: { fixedProfitMmk: 5_000 } });
    const run = await previewRun({ locationId: f.chi.id, roundTo: 100 }, f.userId);
    expect(run).toMatchObject({ locationId: f.chi.id, rateId: null, marginPct: null });
    expect(await linesOf(run.id)).toEqual([
      expect.objectContaining({ variantId: f.variantId, costVnd: null, costMmk: 18_250, profitMmk: 5_000, newPriceMmk: 23_300 }),
    ]);
    expect(await applyRun(run.id, [f.variantId], f.userId)).toMatchObject({ applied: 1, skipped: [], remaining: 0 });
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } })).priceMmk).toBe(23_300);
  });
});

describe("Cập nhật giá hàng loạt", () => {
  it("xem trước dùng lô nhập gần nhất (ưu tiên landed cost) → áp dụng ghi lịch sử", async () => {
    const f = await makeFixture();
    await receiveLot(f, "OLD", 50_000);
    const latest = await receiveLot(f, "NEW", 100_000);
    const rate = await createRate({ mmkPerUsd: "5200", vndPerUsd: "26000" }, f.userId);

    const run1 = await previewRun({ rateId: rate.id, marginPct: "50", roundTo: 100, brandId: f.brandId }, f.userId);
    expect(await linesOf(run1.id)).toEqual([
      expect.objectContaining({ variantId: f.variantId, costVnd: 100_000, oldPriceMmk: 10_000, newPriceMmk: 30_000 }),
    ]);
    await cancelRun(run1.id, f.userId);

    // Đã phân bổ chi phí chuyến → dùng landed cost.
    await prisma.batch.update({ where: { id: latest.id }, data: { landedCostVnd: 120_000 } });
    const run = await previewRun({ rateId: rate.id, marginPct: "50", roundTo: 100, brandId: f.brandId }, f.userId);
    expect((await linesOf(run.id))[0].newPriceMmk).toBe(36_000);

    const res = await applyRun(run.id, [f.variantId], f.userId);
    expect(res).toMatchObject({ applied: 1, skipped: [], remaining: 0 });
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } })).priceMmk).toBe(36_000);
    const hist = await prisma.priceHistory.findFirstOrThrow({ where: { variantId: f.variantId, runId: run.id } });
    expect(hist).toMatchObject({ oldPriceMmk: 10_000, newPriceMmk: 36_000, reason: "bulk" });

    await expect(applyRun(run.id, [f.variantId], f.userId)).rejects.toThrow(/đã được áp dụng/);
    await expect(cancelRun(run.id, f.userId)).rejects.toThrow();
  });

  it("phiếu nhập nháp/huỷ không là nguồn giá mua; ghi sổ phiếu mới thì nguồn đổi", async () => {
    const f = await makeFixture();
    await receiveLot(f, "POSTED", 100_000);
    const rate = await createRate({ mmkPerUsd: "2600", vndPerUsd: "26000" }, f.userId); // 1 VND = 0.1 MMK
    const draft = (lot: string, unitCostVnd: number) =>
      createDocument(
        { type: "RECEIVE", toId: f.vn.id, lines: [{ variantId: f.variantId, lotNo: lot, expiryDate: "2028-12-31", unitCostVnd, qty: 5 }] },
        f.userId,
      );
    const suggested = async () => {
      const run = await previewRun({ rateId: rate.id, marginPct: "0", roundTo: 1, brandId: f.brandId }, f.userId);
      const [line] = await linesOf(run.id);
      await cancelRun(run.id, f.userId);
      return line.costVnd;
    };

    // Lô của phiếu nháp được tạo ngay — giá cao không được kéo giá đề xuất lên; biến thể vẫn không bị coi là thiếu vốn.
    const pending = await draft("DRAFT", 900_000);
    expect(await suggested()).toBe(100_000);
    const gaps = (await pricingGaps()).find((g) => g.location.id === f.mm.id);
    expect(gaps?.missingCost ?? []).not.toContain(`IT-${f.tag}`);

    // Huỷ phiếu: lô vẫn còn trong DB nhưng không được dùng.
    const cancelled = await draft("CANCELLED", 800_000);
    await cancelDocument(cancelled.id, f.userId);
    expect(await suggested()).toBe(100_000);

    // Ghi sổ phiếu nháp → thành nguồn giá.
    await postDocument(pending.id, f.userId);
    expect(await suggested()).toBe(900_000);
  });

  it("chỉ có lô từ phiếu nháp → biến thể bị coi là thiếu vốn, không vào bản xem trước", async () => {
    const f = await makeFixture();
    await createDocument(
      { type: "RECEIVE", toId: f.vn.id, lines: [{ variantId: f.variantId, lotNo: "D", expiryDate: "2028-12-31", unitCostVnd: 50_000, qty: 5 }] },
      f.userId,
    );
    const rate = await createRate({ mmkPerUsd: "2600", vndPerUsd: "26000" }, f.userId);
    await expect(previewRun({ rateId: rate.id, marginPct: "0", brandId: f.brandId }, f.userId)).rejects.toThrow(/đủ dữ liệu/);
    const gaps = (await pricingGaps()).find((g) => g.location.id === f.mm.id);
    expect(gaps?.missingCost).toContain(`IT-${f.tag}`);
  });

  it("giá bị sửa tay sau khi xem trước → bỏ qua, không ghi đè", async () => {
    const f = await makeFixture();
    await receiveLot(f, "A", 100_000);
    const rate = await createRate({ mmkPerUsd: "5200", vndPerUsd: "26000" }, f.userId);
    const run = await previewRun({ rateId: rate.id, marginPct: "50", brandId: f.brandId }, f.userId);
    await prisma.variant.update({ where: { id: f.variantId }, data: { priceMmk: 12_345 } });

    const res = await applyRun(run.id, [f.variantId], f.userId);
    expect(res).toMatchObject({ applied: 0, skipped: [{ sku: `IT-${f.tag}`, reason: "PRICE_CHANGED" }], remaining: 0 });
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } })).priceMmk).toBe(12_345);
  });

  it("tỷ giá USD: giá tính theo tỷ lệ chính xác", async () => {
    const f = await makeFixture();
    await receiveLot(f, "A", 100_000_000);
    // 100,000,000 × 4500/26000 = 17,307,692.3 → 17,307,693 (qua số làm tròn 0.173077 sẽ ra 17,307,700).
    const rate = await createRate({ mmkPerUsd: "4500", vndPerUsd: "26000" }, f.userId);
    const run = await previewRun({ rateId: rate.id, marginPct: "0", roundTo: 1, brandId: f.brandId }, f.userId);
    expect((await linesOf(run.id))[0]).toMatchObject({ costVnd: 100_000_000, newPriceMmk: 17_307_693 });
  });

  it("combo = tổng vốn thành phần; biến thể chưa có lô bị bỏ qua", async () => {
    const f = await makeFixture();
    await receiveLot(f, "A", 40_000);
    const bundle = await prisma.variant.create({
      data: {
        productId: f.productId,
        sku: `IT-${f.tag}-SET`,
        label: "Set",
        priceMmk: 1,
        isBundle: true,
        bundleItems: { create: { componentId: f.variantId, qty: 2 } },
      },
    });
    await prisma.variant.create({ data: { productId: f.productId, sku: `IT-${f.tag}-NEW`, label: "new", priceMmk: 1 } });
    const rate = await createRate({ mmkPerUsd: "2600", vndPerUsd: "26000" }, f.userId);
    const run = await previewRun({ rateId: rate.id, marginPct: "0", roundTo: 1, brandId: f.brandId }, f.userId);
    const lines = await linesOf(run.id);
    expect(lines).toHaveLength(2);
    expect(lines.find((l) => l.variantId === bundle.id)).toMatchObject({ costVnd: 80_000, newPriceMmk: 8_000 });
  });

  it("tỷ giá/% lãi sai định dạng bị từ chối", async () => {
    const f = await makeFixture();
    await expect(createRate({ mmkPerUsd: "0", vndPerUsd: "26000" }, f.userId)).rejects.toBeInstanceOf(ZodError);
    await expect(createRate({ mmkPerUsd: "4420.123", vndPerUsd: "26000" }, f.userId)).rejects.toBeInstanceOf(ZodError);
    await expect(createRate({ mmkPerUsd: "4420" }, f.userId)).rejects.toBeInstanceOf(ZodError);
    // MMK/VND dưới 0.000001 → cột 6 số lẻ sẽ thành 0.
    await expect(createRate({ mmkPerUsd: "0.01", vndPerUsd: "99999999" }, f.userId)).rejects.toBeInstanceOf(ZodError);
    // Dấu phẩy phân cách nghìn được bỏ; lưu 2 tỷ giá USD + MMK/VND tính sẵn (6 số lẻ).
    const rate = await createRate({ mmkPerUsd: "4,500", vndPerUsd: "26,000.5" }, f.userId);
    expect(rate.mmkPerUsd?.toString()).toBe("4500");
    expect(rate.vndPerUsd?.toString()).toBe("26000.5");
    expect(rate.mmkPerVnd.toString()).toBe("0.173074"); // 0.1730736…
    await expect(previewRun({ rateId: rate.id, marginPct: "-5", brandId: f.brandId }, f.userId)).rejects.toBeInstanceOf(
      ZodError,
    );
  });
});

describe("Cài đặt", () => {
  it("lưu + kiểm tra ràng buộc + ghi audit (khôi phục giá trị cũ sau test)", async () => {
    const f = await makeFixture();
    const before = await getAllSettings();
    const base = { ...before.numbers, "payment.bankInstructions": before.bankInstructions };
    try {
      await expect(saveSettings({ ...base, "expiry.warnDays": 30, "expiry.blockDays": 90 }, f.userId)).rejects.toBeInstanceOf(
        ZodError,
      );
      const changed = await saveSettings({ ...base, "cod.confirmHours": 48 }, f.userId);
      expect(Object.keys(changed)).toEqual(["cod.confirmHours"]);
      expect(await getNumberSetting("cod.confirmHours")).toBe(48);
      const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "settings.save" }, orderBy: { createdAt: "desc" } });
      expect(log.userId).toBe(f.userId);
    } finally {
      await saveSettings(base, f.userId);
    }
  });
});
