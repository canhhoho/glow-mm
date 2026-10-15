import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { prisma } from "@/lib/db";
import { createDocument, postDocument } from "@/server/inventory/documents";
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

describe("Cập nhật giá hàng loạt", () => {
  it("xem trước dùng lô nhập gần nhất (ưu tiên landed cost) → áp dụng ghi lịch sử", async () => {
    const f = await makeFixture();
    await receiveLot(f, "OLD", 50_000);
    const latest = await receiveLot(f, "NEW", 100_000);
    const rate = await createRate({ mmkPerVnd: "0.2" }, f.userId);

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
    expect(res).toEqual({ applied: 1, skipped: [] });
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } })).priceMmk).toBe(36_000);
    const hist = await prisma.priceHistory.findFirstOrThrow({ where: { variantId: f.variantId, runId: run.id } });
    expect(hist).toMatchObject({ oldPriceMmk: 10_000, newPriceMmk: 36_000, reason: "bulk" });

    await expect(applyRun(run.id, [f.variantId], f.userId)).rejects.toThrow(/đã được áp dụng/);
    await expect(cancelRun(run.id, f.userId)).rejects.toThrow();
  });

  it("giá bị sửa tay sau khi xem trước → bỏ qua, không ghi đè", async () => {
    const f = await makeFixture();
    await receiveLot(f, "A", 100_000);
    const rate = await createRate({ mmkPerVnd: "0.2" }, f.userId);
    const run = await previewRun({ rateId: rate.id, marginPct: "50", brandId: f.brandId }, f.userId);
    await prisma.variant.update({ where: { id: f.variantId }, data: { priceMmk: 12_345 } });

    const res = await applyRun(run.id, [f.variantId], f.userId);
    expect(res).toEqual({ applied: 0, skipped: [`IT-${f.tag}`] });
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } })).priceMmk).toBe(12_345);
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
    const rate = await createRate({ mmkPerVnd: "0.1" }, f.userId);
    const run = await previewRun({ rateId: rate.id, marginPct: "0", roundTo: 1, brandId: f.brandId }, f.userId);
    const lines = await linesOf(run.id);
    expect(lines).toHaveLength(2);
    expect(lines.find((l) => l.variantId === bundle.id)).toMatchObject({ costVnd: 80_000, newPriceMmk: 8_000 });
  });

  it("tỷ giá/% lãi sai định dạng bị từ chối", async () => {
    const f = await makeFixture();
    await expect(createRate({ mmkPerVnd: "0" }, f.userId)).rejects.toBeInstanceOf(ZodError);
    await expect(createRate({ mmkPerVnd: "0.1234567" }, f.userId)).rejects.toBeInstanceOf(ZodError);
    const rate = await createRate({ mmkPerVnd: "0.17" }, f.userId);
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
