import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { salesBlockDays } from "@/server/inventory/documents";
import { createOrder } from "@/server/orders/orders";
import { PickError, planHash, planPicks, savePickManifests } from "@/server/orders/picking";
import { transitionOrder } from "@/server/orders/transitions";
import { admin, balance, orderInput, saleFixture, unpublishTestProducts, type SaleFixture } from "./fixtures";

afterAll(unpublishTestProducts);

const lotId = async (f: SaleFixture, lotNo: string) =>
  (await prisma.batch.findUniqueOrThrow({ where: { variantId_lotNo: { variantId: f.variantId, lotNo } } })).id;
async function confirmed(f: SaleFixture, qty: number) {
  const o = await createOrder(orderInput(f, qty), { userId: null });
  await transitionOrder(o.id, "confirmCod", admin(f));
  return o;
}
async function print(f: SaleFixture, ids: string[]) {
  const plans = await planPicks(prisma, ids, { now: new Date(), blockDays: await salesBlockDays() });
  return { plans, res: await savePickManifests({ ids, hash: planHash(plans) }, admin(f)) };
}
const allocations = (orderId: string) =>
  prisma.orderAllocation.findMany({ where: { orderItem: { orderId } }, select: { batchId: true, qty: true } });
const ship = (f: SaleFixture, orderId: string) => transitionOrder(orderId, "ship", admin(f), { carrier: "VTP" });

describe("Phiếu soạn có lô (D3-lite)", () => {
  it("in nhiều đơn dùng chung tồn từng lô (FEFO); bàn giao xuất đúng lô trên phiếu, phiếu được đánh dấu đã dùng", async () => {
    const f = await saleFixture([
      { lot: "SOON", expiryInDays: 200, qty: 3 },
      { lot: "LATE", expiryInDays: 500, qty: 10 },
    ]);
    const [soon, late] = [await lotId(f, "SOON"), await lotId(f, "LATE")];
    const o1 = await confirmed(f, 2);
    const o2 = await confirmed(f, 2);
    const pending = await createOrder(orderInput(f, 1), { userId: null }); // chưa xác nhận → không chốt lô

    const { plans, res } = await print(f, [o1.id, o2.id, pending.id]);
    expect(plans.map((p) => p.status)).toEqual(["PLANNED", "PLANNED", "NOT_CONFIRMED"]);
    expect(res).toEqual({ saved: 2, skipped: [{ orderId: pending.id, status: "NOT_CONFIRMED" }] });
    const lines = await prisma.orderPickLine.findMany({ where: { orderId: o2.id }, select: { batchId: true, qty: true } });
    expect(lines.sort((a, b) => a.qty - b.qty || a.batchId.localeCompare(b.batchId))).toEqual(
      [{ batchId: soon, qty: 1 }, { batchId: late, qty: 1 }].sort((a, b) => a.qty - b.qty || a.batchId.localeCompare(b.batchId)),
    );

    await ship(f, o2.id); // xuất o2 trước: vẫn đúng lô trên phiếu (SOON×1 + LATE×1), không lấy SOON×2
    expect((await allocations(o2.id)).sort((a, b) => a.batchId.localeCompare(b.batchId))).toEqual(
      [{ batchId: soon, qty: 1 }, { batchId: late, qty: 1 }].sort((a, b) => a.batchId.localeCompare(b.batchId)),
    );
    expect((await prisma.orderPick.findUniqueOrThrow({ where: { orderId: o2.id } })).consumedAt).not.toBeNull();
    await ship(f, o1.id);
    expect(await allocations(o1.id)).toEqual([{ batchId: soon, qty: 2 }]);
    expect(await balance(soon, f.mm.id)).toBe(0);
    expect(await balance(late, f.mm.id)).toBe(9);
  });

  it("in riêng từng đơn: không gợi ý trùng phần hàng đã nằm trên phiếu soạn chưa bàn giao của đơn khác", async () => {
    const f = await saleFixture([
      { lot: "SOON", expiryInDays: 200, qty: 3 },
      { lot: "LATE", expiryInDays: 500, qty: 10 },
    ]);
    const [soon, late] = [await lotId(f, "SOON"), await lotId(f, "LATE")];
    const o1 = await confirmed(f, 2);
    const o2 = await confirmed(f, 2);
    await print(f, [o1.id]);
    const { plans } = await print(f, [o2.id]);
    const picks = plans[0].picks.map((p) => [p.batchId, p.qty]).sort();
    expect(picks).toEqual([[late, 1], [soon, 1]].sort());
  });

  it("phiếu đang xem đã cũ (tồn đổi) → không chốt; lô trên phiếu bị lấy mất → bàn giao bị chặn, không xuất gì; in lại thì xong", async () => {
    const f = await saleFixture([
      { lot: "SOON", expiryInDays: 200, qty: 2 },
      { lot: "LATE", expiryInDays: 500, qty: 10 },
    ]);
    const soon = await lotId(f, "SOON");
    const o1 = await confirmed(f, 2);
    const stale = await planPicks(prisma, [o1.id], { now: new Date(), blockDays: await salesBlockDays() });
    await expect(savePickManifests({ ids: [o1.id], hash: "khac" }, admin(f))).rejects.toBeInstanceOf(PickError);
    await savePickManifests({ ids: [o1.id], hash: planHash(stale) }, admin(f)); // SOON×2

    // Đơn khác (không phiếu) bàn giao theo FEFO, lấy mất lô SOON.
    const o2 = await confirmed(f, 2);
    await ship(f, o2.id);
    expect(await balance(soon, f.mm.id)).toBe(0);

    await expect(ship(f, o1.id)).rejects.toMatchObject({ code: "pick_mismatch" });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o1.id } })).status).toBe("COD_CONFIRMED");
    expect(await allocations(o1.id)).toEqual([]);

    await print(f, [o1.id]); // in lại → LATE×2
    await ship(f, o1.id);
    expect(await allocations(o1.id)).toEqual([{ batchId: await lotId(f, "LATE"), qty: 2 }]);
  });

  it("đơn đổi số lượng sau khi in → pick_mismatch; cài đặt bắt buộc phiếu soạn → đơn chưa in không bàn giao được", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 10 }]);
    const o1 = await confirmed(f, 2);
    await print(f, [o1.id]);
    await prisma.orderItem.updateMany({ where: { orderId: o1.id }, data: { qty: 3 } });
    await expect(ship(f, o1.id)).rejects.toMatchObject({ code: "pick_mismatch" });

    const key = "orders.requirePickList";
    await prisma.setting.upsert({ where: { key }, update: { value: true }, create: { key, value: true } });
    try {
      const o2 = await confirmed(f, 1);
      await expect(ship(f, o2.id)).rejects.toMatchObject({ code: "pick_required" });
      await print(f, [o2.id]);
      await ship(f, o2.id);
    } finally {
      await prisma.setting.delete({ where: { key } });
    }
  });
});
