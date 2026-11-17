import { describe, expect, it, afterAll, vi } from "vitest";
// Kiểm quy tắc hạn dùng → chạy với cờ hạn dùng BẬT (production đang tắt, 17/11/2026; hành vi tắt: expiry-off.test.ts).
vi.mock("@/lib/features", async (orig) => (await import("../support/expiry-on")).expiryOn(orig));
import { prisma } from "@/lib/db";
import { createDocument, postDocument, resolveBatchExpiry } from "@/server/inventory/documents";
import { availableToSell } from "@/server/orders/availability";
import { createOrder } from "@/server/orders/orders";
import { transitionOrder } from "@/server/orders/transitions";
import { remitCod } from "@/server/orders/cod";
import { makeFixture, saleFixture, admin, orderInput, unpublishTestProducts } from "./fixtures";

afterAll(unpublishTestProducts);
describe("Lô chưa biết hạn", () => {
  it("unknown batches remain blocked until a real expiry is confirmed", async () => {
    const f = await makeFixture();
    const doc = await createDocument({ type: "RECEIVE", toId: f.mm.id, lines: [{ variantId: f.variantId, lotNo: "U", expiryStatus: "UNKNOWN", unitCostVnd: 100, qty: 5 }] }, f.userId);
    await postDocument(doc.id, f.userId);
    const opts = { now: new Date(), blockDays: 90 };
    expect((await availableToSell(prisma, [f.variantId], opts)).get(f.variantId)).toBe(0);
    const batch = await prisma.batch.findFirstOrThrow({ where: { variantId: f.variantId } });
    const expiryDate = new Date(Date.now() + 400 * 86400000).toISOString().slice(0, 10);
    await resolveBatchExpiry({ batchId: batch.id, expiryDate }, f.userId);
    expect((await availableToSell(prisma, [f.variantId], opts)).get(f.variantId)).toBe(5);
    await expect(resolveBatchExpiry({ batchId: batch.id, expiryDate }, f.userId)).rejects.toThrow("Chỉ cập nhật");
    // 16/11/2026: hạn dùng theo lô — lô "Không có hạn" nhập được cho mọi SP (không còn chặn theo cờ của SP).
    await expect(createDocument({ type: "RECEIVE", toId: f.mm.id, lines: [{ variantId: f.variantId, lotNo: "N", expiryStatus: "NONE", unitCostVnd: 100, qty: 1 }] }, f.userId)).resolves.toBeTruthy();
  });
});

describe("COD collection and remittance", () => {
  it("completion records collection only; reconciliation checks role, totals, duplicate submissions and audit", async () => {
    const f = await saleFixture([{ lot: "COD", expiryInDays: 400, qty: 3 }]);
    const order = await createOrder(orderInput(f, 1), { userId: f.userId });
    await transitionOrder(order.id, "confirmCod", admin(f));
    await transitionOrder(order.id, "ship", admin(f), { fromLocationId: f.mm.id, carrier: "VTP" });
    const completed = await transitionOrder(order.id, "complete", admin(f));
    expect(completed.codCollectedAt).not.toBeNull();
    expect(completed.codRemittedAt).toBeNull();
    const payload = { orderId: order.id, receivedMmk: order.totalMmk - 500, feeMmk: 500, reference: "BANK-COD-01" };
    await expect(remitCod(payload, { userId: f.userId, role: "ORDER_STAFF" })).rejects.toThrow("Không có quyền");
    await expect(remitCod({ ...payload, feeMmk: 0 }, admin(f))).rejects.toThrow("phải bằng");
    const results = await Promise.allSettled([remitCod(payload, admin(f)), remitCod(payload, admin(f))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.order.findUnique({ where: { id: order.id } })).toMatchObject({ status: "COMPLETED", paymentStatus: "PAID", codRemittedMmk: order.totalMmk - 500, codCarrierFeeMmk: 500, codRemittanceRef: "BANK-COD-01" });
    expect(await prisma.auditLog.count({ where: { entityId: order.id, action: "order.cod-remit" } })).toBe(1);
  });
});
