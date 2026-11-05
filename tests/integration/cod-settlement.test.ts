import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createOrder } from "@/server/orders/orders";
import { transitionOrder } from "@/server/orders/transitions";
import { returnItems } from "@/server/orders/returns";
import { remitCod, settleCodException } from "@/server/orders/cod";
import { setShippingPayer } from "@/server/orders/shipping-payer";
import { salesReport } from "@/server/reports/queries";
import { yangonDayKey } from "@/lib/time";
import { admin, orderInput, saleFixture, unpublishTestProducts } from "./fixtures";

afterAll(unpublishTestProducts);

async function completed(qty = 2) {
  const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 20 }]);
  const order = await createOrder(orderInput(f, qty), { userId: null });
  for (const step of ["confirmCod", "ship", "complete"] as const) await transitionOrder(order.id, step, admin(f), { carrier: "VTP" });
  return { f, order };
}

describe("D4 COD và người trả cước", () => {
  it("100000 COD = 97000 về + 3000 phí; đối soát không tăng doanh thu, trừ phí đúng một lần", async () => {
    const { f, order } = await completed(10);
    const day = yangonDayKey(new Date());
    const before = await salesReport({ from: day, to: day });
    await remitCod({ orderId: order.id, receivedMmk: 97000, feeMmk: 3000, reference: `D4-${f.tag}` }, admin(f));
    const after = await salesReport({ from: day, to: day });
    expect(after.totals.revenue).toBe(before.totals.revenue);
    expect(after.totals.cogs).toBe(before.totals.cogs);
    expect(after.totals.codCarrierFees - before.totals.codCarrierFees).toBe(3000);
    expect(after.totals.profitAfterRecordedCosts).toBe(before.totals.profitAfterRecordedCosts - 3000);
    expect(after.totals.unsettledCodOrders).toBe(before.totals.unsettledCodOrders - 1);
  });

  it("đóng ngoại lệ hoàn một phần, kiểm tổng/quyền/lý do và chống ghi trùng", async () => {
    const { f, order } = await completed();
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    await returnItems(order.id, { lines: [{ orderItemId: item.id, qty: 1 }], toLocationId: f.qc.id, reason: "Hoàn một phần", refunded: true }, admin(f));
    const input = { orderId: order.id, receivedMmk: 9500, feeMmk: 500, adjustmentMmk: 10000, reference: `EX-${f.tag}`, note: "Đã đối chiếu hãng và khoản hoàn khách" };
    await expect(remitCod(input, admin(f))).rejects.toThrow(/chưa có hoàn/);
    await expect(settleCodException(input, { userId: f.userId, role: "ORDER_STAFF" })).rejects.toThrow(/quyền/);
    await expect(settleCodException({ ...input, note: " " }, admin(f))).rejects.toThrow();
    await expect(settleCodException({ ...input, adjustmentMmk: 9999 }, admin(f))).rejects.toThrow(/phải bằng/);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).codRemittedAt).toBeNull();
    const results = await Promise.allSettled([settleCodException(input, admin(f)), settleCodException(input, admin(f))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ status: "COMPLETED", codRemittedMmk: 9500, codCarrierFeeMmk: 500, codAdjustmentMmk: 10000, codSettlementNote: input.note });
    expect(await prisma.auditLog.count({ where: { entityId: order.id, action: "order.cod-exception" } })).toBe(1);
    expect((await prisma.orderItem.findUniqueOrThrow({ where: { id: item.id } })).returnedQty).toBe(1);
  });

  it("đơn thường không dùng luồng ngoại lệ để giảm khoản phải thu", async () => {
    const { f, order } = await completed();
    await expect(settleCodException({ orderId: order.id, receivedMmk: 10000, feeMmk: 0, adjustmentMmk: 10000, reference: "NO", note: "Không hợp lệ" }, admin(f))).rejects.toThrow(/không có ngoại lệ/);
  });

  it("web luôn người nhận trả; đơn tạo tay lưu lựa chọn và chỉ sửa khi chuẩn bị giao", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 10 }]);
    const web = await createOrder(orderInput(f, 1, { shippingPayer: "SENDER" }), { userId: null });
    expect(web.shippingPayer).toBe("RECEIVER");
    const manual = await createOrder(orderInput(f, 1, { shippingPayer: "SENDER" }), { userId: f.userId });
    expect(manual.shippingPayer).toBe("SENDER");
    const input = { orderId: manual.id, shippingPayer: "RECEIVER" };
    await expect(setShippingPayer(input, admin(f))).rejects.toMatchObject({ code: "invalid_transition" });
    await transitionOrder(manual.id, "confirmCod", admin(f));
    await expect(setShippingPayer(input, { userId: f.userId, role: "WAREHOUSE_MANAGER" })).rejects.toMatchObject({ code: "forbidden" });
    expect((await setShippingPayer(input, admin(f))).shippingPayer).toBe("RECEIVER");
    await transitionOrder(manual.id, "ship", admin(f), { carrier: "VTP" });
    await expect(setShippingPayer({ ...input, shippingPayer: "SENDER" }, admin(f))).rejects.toMatchObject({ code: "invalid_transition" });
  });
});
