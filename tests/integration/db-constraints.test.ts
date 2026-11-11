import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { makeFixture, saleFixture, unpublishTestProducts } from "./fixtures";

afterAll(unpublishTestProducts);

// P4 — ràng buộc ở tầng DB (migration 20261111120000_db_integrity_constraints): lưới an toàn sau code.

describe("Ràng buộc toàn vẹn DB (P4)", () => {
  it("sổ kho chỉ ghi thêm; tồn không âm", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 5 }]);
    const row = await prisma.stockLedger.findFirstOrThrow({ where: { batch: { variantId: f.variantId } } });
    await expect(prisma.stockLedger.update({ where: { id: row.id }, data: { qtyDelta: 99 } })).rejects.toThrow("chỉ được ghi thêm");
    await expect(prisma.stockLedger.delete({ where: { id: row.id } })).rejects.toThrow("chỉ được ghi thêm");
    expect((await prisma.stockLedger.findUniqueOrThrow({ where: { id: row.id } })).qtyDelta).toBe(row.qtyDelta);

    const bal = await prisma.stockBalance.findFirstOrThrow({ where: { batchId: row.batchId } });
    await expect(
      prisma.stockBalance.update({ where: { batchId_locationId_stockType: { batchId: bal.batchId, locationId: bal.locationId, stockType: bal.stockType } }, data: { qty: -1 } }),
    ).rejects.toThrow(/StockBalance_qty_non_negative|check/i);
  });

  it("tên loại không trùng trong cùng SP (bỏ qua hoa thường/khoảng trắng); đổi chéo nhãn trong một transaction vẫn được", async () => {
    const f = await makeFixture();
    // Nhãn của fixture là "50ml".
    await expect(prisma.variant.create({ data: { productId: f.productId, sku: `${f.tag}-DUP`, label: " 50ML ", priceMmk: 1 } })).rejects.toMatchObject({ code: "P2002" });
    expect(await prisma.variant.count({ where: { productId: f.productId } })).toBe(1);

    const b = await prisma.variant.create({ data: { productId: f.productId, sku: `${f.tag}-B`, label: "100ml", priceMmk: 1 } });
    await prisma.$transaction(async (tx) => {
      await tx.variant.update({ where: { id: f.variantId }, data: { label: "100ml" } });
      await tx.variant.update({ where: { id: b.id }, data: { label: "50ml" } });
    });
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: b.id } })).label).toBe("50ml");

    // Cùng nhãn ở SP khác thì hợp lệ.
    const other = await makeFixture();
    await expect(prisma.variant.update({ where: { id: other.variantId }, data: { label: "100ml" } })).resolves.toBeTruthy();
  });
});
