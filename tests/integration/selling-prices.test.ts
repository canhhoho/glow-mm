import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { saveProductPricing } from "@/server/catalog/product-pricing";
import { listSellingPrices, sellingPriceStats } from "@/server/pricing/selling-prices";
import { makeFixture } from "./fixtures";

// P3b — trang Giá bán: giá chờ duyệt của SP đã duyệt; form gửi giá hiệu lực để lưu lần hai không bị báo xung đột.

describe("Trang Giá bán (P3b)", () => {
  it("SP đã duyệt có giá chờ duyệt: dòng hiện giá chờ duyệt, giá hiệu lực = giá chờ duyệt, lưu tiếp theo giá hiệu lực được", async () => {
    const f = await makeFixture();
    await prisma.product.update({ where: { id: f.productId }, data: { published: true, approvedAt: new Date(), approvalStatus: "APPROVED" } });
    const save = (priceMmk: number, expectedPriceMmk: number) =>
      saveProductPricing({ productId: f.productId, reason: "Giá mới", variants: [{ id: f.variantId, priceMmk, expectedPriceMmk }] }, f.userId);

    await save(12_000, 10_000);
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } })).priceMmk).toBe(10_000); // live chưa đổi

    const { rows } = await listSellingPrices({ q: f.tag, state: "pending", page: 1, size: 20 });
    const row = rows.find((r) => r.id === f.variantId)!;
    expect(row).toMatchObject({ priceMmk: 10_000, pendingMmk: 12_000, effectiveMmk: 12_000 });
    expect((await sellingPriceStats()).pending).toBeGreaterThanOrEqual(1);

    // Lỗi cũ: form gửi giá live (10.000) → báo "vừa được đổi". Giá hiệu lực thì lưu được.
    await expect(save(13_000, row.priceMmk)).rejects.toThrow(/vừa được đổi/);
    await save(13_000, row.effectiveMmk);
    const again = (await listSellingPrices({ q: f.tag, page: 1, size: 20 })).rows.find((r) => r.id === f.variantId)!;
    expect(again).toMatchObject({ priceMmk: 10_000, pendingMmk: 13_000 });
  });

  it("lọc chưa có giá theo kho", async () => {
    const f = await makeFixture();
    await prisma.variant.update({ where: { id: f.variantId }, data: { priceMmk: 0 } });
    const inMine = await listSellingPrices({ q: f.tag, state: "zero", warehouseId: f.mm.id, page: 1, size: 20 });
    expect(inMine.rows.map((r) => r.id)).toEqual([f.variantId]);
    const other = await listSellingPrices({ q: f.tag, state: "zero", warehouseId: f.chi.id, page: 1, size: 20 });
    expect(other.total).toBe(0);
  });
});
