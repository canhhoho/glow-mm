import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { discardFromQuarantine, restockFromQuarantine } from "@/server/inventory/quarantine";
import { createOrder } from "@/server/orders/orders";
import { returnItems } from "@/server/orders/returns";
import { transitionOrder } from "@/server/orders/transitions";
import { admin, avail, balance, orderInput, saleFixture, unpublishTestProducts, type SaleFixture } from "./fixtures";

afterAll(unpublishTestProducts);

/** Đơn COD đã giao xong (qua đủ luồng: xác nhận → đóng gói FEFO → giao → hoàn tất). */
async function completedOrder(f: SaleFixture, input: Record<string, unknown>) {
  const order = await createOrder(input, { userId: null });
  await transitionOrder(order.id, "confirmCod", admin(f));
  await transitionOrder(order.id, "pack", admin(f), { fromLocationId: f.mm.id });
  await transitionOrder(order.id, "ship", admin(f), { carrier: "Test" });
  await transitionOrder(order.id, "complete", admin(f));
  return prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
}

async function ledgerMatches(batchIds: string[]) {
  for (const id of batchIds) {
    const sum = await prisma.stockLedger.aggregate({ where: { batchId: id }, _sum: { qtyDelta: true } });
    const bal = await prisma.stockBalance.aggregate({ where: { batchId: id }, _sum: { qty: true } });
    expect(sum._sum.qtyDelta).toBe(bal._sum.qty);
  }
}

describe("Trả hàng", () => {
  it("trả một phần rồi trả hết: về đúng lô đã xuất, vào Chờ kiểm tra; đơn → RETURNED + REFUNDED", async () => {
    const f = await saleFixture([
      { lot: "MID", expiryInDays: 300, qty: 3 },
      { lot: "FAR", expiryInDays: 600, qty: 10 },
    ]);
    const batches = await prisma.batch.findMany({ where: { variantId: f.variantId } });
    const lot = (no: string) => batches.find((b) => b.lotNo === no)!.id;
    const order = await completedOrder(f, orderInput(f, 5));
    const item = order.items[0];

    const r1 = await returnItems(order.id, { toLocationId: f.qc.id, lines: [{ orderItemId: item.id, qty: 2 }], reason: "Hỏng vỏ" }, admin(f));
    expect(r1.fullyReturned).toBe(false);
    expect(await balance(lot("MID"), f.qc.id)).toBe(2);
    let o = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
    expect(o.status).toBe("COMPLETED");
    expect(o.items[0].returnedQty).toBe(2);

    await expect(
      returnItems(order.id, { toLocationId: f.qc.id, lines: [{ orderItemId: item.id, qty: 4 }], reason: "x" }, admin(f)),
    ).rejects.toMatchObject({ code: "invalid_transition" });

    const r2 = await returnItems(
      order.id,
      { toLocationId: f.qc.id, lines: [{ orderItemId: item.id, qty: 3 }], reason: "Khách đổi ý", refunded: true },
      admin(f),
    );
    expect(r2.fullyReturned).toBe(true);
    expect(await balance(lot("MID"), f.qc.id)).toBe(3);
    expect(await balance(lot("FAR"), f.qc.id)).toBe(2);
    o = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
    expect(o).toMatchObject({ status: "RETURNED", paymentStatus: "REFUNDED" });
    const docs = await prisma.stockDocument.findMany({ where: { orderId: order.id, type: "RETURN" } });
    expect(docs).toHaveLength(2);
    expect(docs.every((d) => d.status === "POSTED" && d.toId === f.qc.id)).toBe(true);
    await ledgerMatches(batches.map((b) => b.id));
  });

  it("combo: trả theo bộ → từng thành phần", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 10 }]);
    const bundle = await prisma.variant.create({
      data: {
        productId: f.productId,
        sku: `IT-${f.tag}-SET`,
        label: "Set x2",
        priceMmk: 18_000,
        isBundle: true,
        bundleItems: { create: { componentId: f.variantId, qty: 2 } },
      },
    });
    const order = await completedOrder(f, { ...orderInput(f, 1), items: [{ variantId: bundle.id, qty: 3 }] });
    await returnItems(order.id, { toLocationId: f.qc.id, lines: [{ orderItemId: order.items[0].id, qty: 1 }], reason: "x" }, admin(f));
    const [batch] = await prisma.batch.findMany({ where: { variantId: f.variantId } });
    expect(await balance(batch.id, f.qc.id)).toBe(2);
  });

  it("chỉ trả được đơn đã giao; không đổi RETURNED bằng chuyển trạng thái trực tiếp", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 10 }]);
    const pending = await createOrder(orderInput(f, 1), { userId: null });
    const items = await prisma.orderItem.findMany({ where: { orderId: pending.id } });
    await expect(
      returnItems(pending.id, { toLocationId: f.qc.id, lines: [{ orderItemId: items[0].id, qty: 1 }], reason: "x" }, admin(f)),
    ).rejects.toMatchObject({ code: "invalid_transition" });

    const done = await completedOrder(f, orderInput(f, 1));
    await expect(transitionOrder(done.id, "returned", admin(f))).rejects.toMatchObject({ code: "invalid_transition" });
  });
});

describe("Khu Chờ kiểm tra", () => {
  it("nhập lại kho bán → khả dụng tăng; huỷ → trừ khỏi Chờ kiểm tra; chặn vị trí sai", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 10 }]);
    const order = await completedOrder(f, orderInput(f, 4));
    await returnItems(order.id, { toLocationId: f.qc.id, lines: [{ orderItemId: order.items[0].id, qty: 4 }], reason: "x" }, admin(f));
    const [batch] = await prisma.batch.findMany({ where: { variantId: f.variantId } });
    expect(await avail(f.variantId)).toBe(6);

    await restockFromQuarantine(
      { batchId: batch.id, fromId: f.qc.id, toId: f.mm.id, qty: 3 },
      f.userId,
    );
    expect(await balance(batch.id, f.qc.id)).toBe(1);
    expect(await avail(f.variantId)).toBe(9);

    await expect(
      restockFromQuarantine({ batchId: batch.id, fromId: f.qc.id, toId: f.vn.id, qty: 1 }, f.userId),
    ).rejects.toThrow(/bán được/);
    await expect(
      discardFromQuarantine({ batchId: batch.id, fromId: f.mm.id, qty: 1, reason: "x" }, f.userId),
    ).rejects.toThrow(/Chờ kiểm tra/);
    await expect(
      discardFromQuarantine({ batchId: batch.id, fromId: f.qc.id, qty: 2, reason: "Vỡ" }, f.userId),
    ).rejects.toThrow(/Tồn không đủ/);
    // Phiếu lỗi được huỷ, không để lại nháp treo.
    expect(await prisma.stockDocument.count({ where: { status: "DRAFT", lines: { some: { batchId: batch.id } } } })).toBe(0);

    await discardFromQuarantine({ batchId: batch.id, fromId: f.qc.id, qty: 1, reason: "Vỡ" }, f.userId);
    expect(await balance(batch.id, f.qc.id)).toBe(0);
    await ledgerMatches([batch.id]);
  });
});
