import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createDocument, postDocument } from "@/server/inventory/documents";
import { cancelExpiredOrders } from "@/server/orders/cron";
import { createOrder } from "@/server/orders/orders";
import { preorderCapacity, preorderQueue } from "@/server/orders/preorder";
import { saveProductPreorder } from "@/server/catalog/product-preorder";
import { transitionOrder } from "@/server/orders/transitions";
import { admin, avail, isoDay, makeFixture, orderInput, saleFixture, unpublishTestProducts, type SaleFixture } from "./fixtures";

afterAll(unpublishTestProducts);

// QT3 — đặt trước khi hết hàng: chỉ đơn khách web; cả đơn chờ hàng, không giữ hàng; hạn mức theo biến thể.

async function preorderFixture(stock: number, limit: number | null = 5): Promise<SaleFixture> {
  const f: SaleFixture = stock > 0
    ? await saleFixture([{ lot: "A", expiryInDays: 400, qty: stock }])
    : { ...(await makeFixture()), townshipId: "tw-YGN-WYG-KMY" };
  await prisma.product.update({ where: { id: f.productId }, data: { published: true, approvedAt: new Date() } });
  await prisma.product.update({ where: { id: f.productId }, data: { preorderEnabled: true } });
  await prisma.variant.update({ where: { id: f.variantId }, data: { preorderLimit: limit } });
  return f;
}
const capacity = async (variantId: string) => (await preorderCapacity(prisma, [variantId])).get(variantId);
async function receive(f: SaleFixture, qty: number, lot: string) {
  const doc = await createDocument({ type: "RECEIVE", toId: f.mm.id, lines: [{ variantId: f.variantId, lotNo: lot, expiryDate: isoDay(400), unitCostVnd: 100_000, qty }] }, f.userId);
  await postDocument(doc.id, f.userId);
}

describe("Đặt trước (QT3)", () => {
  it("đơn web vượt tồn → AWAITING_STOCK, không giữ hàng, trừ hạn mức; vượt hạn mức → out_of_stock", async () => {
    const f = await preorderFixture(2, 5);
    const order = await createOrder(orderInput(f, 3), { userId: null });
    expect(order).toMatchObject({ status: "AWAITING_STOCK", preorder: true });
    expect(await prisma.reservation.count({ where: { orderId: order.id } })).toBe(0);
    expect(await avail(f.variantId)).toBe(2); // tồn không bị giữ
    expect(await capacity(f.variantId)).toBe(2);
    expect(await prisma.orderStatusHistory.findMany({ where: { orderId: order.id }, select: { toStatus: true } })).toEqual([{ toStatus: "AWAITING_STOCK" }]);

    await expect(createOrder(orderInput(f, 3, { phone: "09781234567" }), { userId: null })).rejects.toMatchObject({ code: "out_of_stock" });
    // Còn đủ tồn → đơn thường, giữ hàng như trước.
    const normal = await createOrder(orderInput(f, 2, { phone: "09781234568" }), { userId: null });
    expect(normal).toMatchObject({ status: "PENDING", preorder: false });
  });

  it("đơn nhân viên / CTV tạo tay cũng đặt trước được (19/11/2026); SP tắt đặt trước, combo: thiếu hàng vẫn out_of_stock", async () => {
    const f = await preorderFixture(1, 5);
    // Trước 19/11/2026 đơn tạo tay thiếu hàng luôn lỗi; nay theo cùng hạn mức với đơn web.
    expect(await createOrder(orderInput(f, 2), { userId: f.userId })).toMatchObject({ status: "AWAITING_STOCK", preorder: true });
    expect(await capacity(f.variantId)).toBe(3);
    await expect(createOrder(orderInput(f, 4, { phone: "09781234560" }), { userId: f.userId })).rejects.toMatchObject({ code: "out_of_stock" }); // vượt hạn mức còn lại
    const combo = await prisma.variant.create({
      data: { productId: f.productId, sku: `IT-${f.tag}-SET`, label: "Set", priceMmk: 15_000, isBundle: true, bundleItems: { create: { componentId: f.variantId, qty: 2 } } },
    });
    await expect(createOrder({ ...orderInput(f, 1), items: [{ variantId: combo.id, qty: 1 }] }, { userId: null })).rejects.toMatchObject({ code: "out_of_stock" });
    await prisma.product.update({ where: { id: f.productId }, data: { preorderEnabled: false } });
    expect(await capacity(f.variantId)).toBe(0);
    await expect(createOrder(orderInput(f, 2), { userId: null })).rejects.toMatchObject({ code: "out_of_stock" });
  });

  it("hạn mức mặc định theo cài đặt khi biến thể để trống", async () => {
    const f = await preorderFixture(0, null);
    const key = "preorder.defaultLimit";
    const before = await prisma.setting.findUnique({ where: { key } });
    await prisma.setting.upsert({ where: { key }, update: { value: 4 }, create: { key, value: 4 } });
    try {
      expect(await capacity(f.variantId)).toBe(4);
      await createOrder(orderInput(f, 3), { userId: null });
      expect(await capacity(f.variantId)).toBe(1);
    } finally {
      if (before) await prisma.setting.update({ where: { key }, data: { value: before.value ?? 20 } });
      else await prisma.setting.delete({ where: { key } });
    }
  });

  it("hai đơn đồng thời tranh hạn mức cuối: chỉ một đơn được nhận", async () => {
    const f = await preorderFixture(0, 3);
    const results = await Promise.allSettled([
      createOrder(orderInput(f, 2), { userId: null }),
      createOrder(orderInput(f, 2, { phone: "09781234567" }), { userId: null }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "out_of_stock" });
    expect(await capacity(f.variantId)).toBe(1);
  });

  it("hàng về: danh sách chờ chia FIFO; chuyển xử lý thiếu hàng bị chặn, đủ thì giữ hàng → PENDING; cron không huỷ đơn chờ hàng", async () => {
    const f = await preorderFixture(0, 10);
    const first = await createOrder(orderInput(f, 2), { userId: null });
    const second = await createOrder(orderInput(f, 3, { phone: "09781234567" }), { userId: null });
    await expect(transitionOrder(first.id, "stockArrived", admin(f))).rejects.toMatchObject({ code: "out_of_stock" });

    await receive(f, 3, "B");
    const queue = (await preorderQueue(prisma, { now: new Date(), blockDays: 90 })).filter((o) => [first.id, second.id].includes(o.id));
    expect(queue.map((o) => [o.id, o.enough, o.items[0].short])).toEqual([
      [first.id, true, 0],
      [second.id, false, 2],
    ]);

    // Cron huỷ COD quá hạn không đụng đơn chờ hàng (không có giữ hàng).
    await cancelExpiredOrders("COD", new Date(Date.now() + 10 * 86_400_000));
    expect((await prisma.order.findUniqueOrThrow({ where: { id: second.id } })).status).toBe("AWAITING_STOCK");

    const moved = await transitionOrder(first.id, "stockArrived", admin(f));
    expect(moved).toMatchObject({ status: "PENDING", preorder: true });
    const res = await prisma.reservation.findMany({ where: { orderId: first.id, status: "ACTIVE" } });
    expect(res.map((r) => r.qty)).toEqual([2]);
    expect(res[0].expiresAt).not.toBeNull();
    expect(await avail(f.variantId)).toBe(1);
    // Đơn đã chuyển không còn chiếm hạn mức đặt trước.
    expect(await capacity(f.variantId)).toBe(7);

    // Huỷ đơn chờ hàng: không có giữ hàng để nhả, hạn mức được trả lại.
    await transitionOrder(second.id, "cancel", admin(f), { reason: "Khách đổi ý" });
    expect(await capacity(f.variantId)).toBe(10);
  });

  it("21/11/2026: chuyển khoản trả trước cho đơn đặt trước → Đã nhận tiền trước; hàng về → chuẩn bị giao, giữ hàng không hết hạn", async () => {
    const f = await preorderFixture(0, 10);
    const order = await createOrder(orderInput(f, 2, { paymentMethod: "BANK_TRANSFER" }), { userId: null });
    expect(order).toMatchObject({ status: "AWAITING_STOCK", paymentStatus: "UNPAID" });

    const prepaid = await transitionOrder(order.id, "confirmPrepayment", admin(f));
    expect(prepaid).toMatchObject({ status: "AWAITING_STOCK", paymentStatus: "PAID" });
    expect(await prisma.reservation.count({ where: { orderId: order.id } })).toBe(0); // hàng chưa về → chưa giữ hàng
    await expect(transitionOrder(order.id, "confirmPrepayment", admin(f))).rejects.toMatchObject({ code: "invalid_transition" });
    await expect(transitionOrder(order.id, "stockArrived", admin(f))).rejects.toMatchObject({ code: "invalid_transition" });

    await expect(transitionOrder(order.id, "stockArrivedPaid", admin(f))).rejects.toMatchObject({ code: "out_of_stock" });
    await receive(f, 2, "P");
    const moved = await transitionOrder(order.id, "stockArrivedPaid", admin(f));
    expect(moved).toMatchObject({ status: "PAYMENT_CONFIRMED", paymentStatus: "PAID" });
    const res = await prisma.reservation.findMany({ where: { orderId: order.id, status: "ACTIVE" } });
    expect(res.map((r) => [r.qty, r.expiresAt])).toEqual([[2, null]]);

    // Cron hết hạn chuyển khoản không huỷ đơn đã trả.
    await cancelExpiredOrders("BANK_TRANSFER", new Date(Date.now() + 10 * 86_400_000));
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAYMENT_CONFIRMED");
    expect((await prisma.orderStatusHistory.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "asc" }, select: { toStatus: true } })).map((h) => h.toStatus)).toEqual([
      "AWAITING_STOCK",
      "AWAITING_STOCK",
      "PAYMENT_CONFIRMED",
    ]);
  });

  it("bước 5: lưu bật/tắt + hạn mức riêng (trống = mặc định), có audit; biến thể SP khác bị chặn", async () => {
    const f = await preorderFixture(0, null);
    await saveProductPreorder({ productId: f.productId, enabled: false, limits: [{ id: f.variantId, limit: "7" }] }, f.userId);
    expect(await prisma.product.findUniqueOrThrow({ where: { id: f.productId }, select: { preorderEnabled: true } })).toEqual({ preorderEnabled: false });
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } })).preorderLimit).toBe(7);
    await saveProductPreorder({ productId: f.productId, enabled: true, limits: [{ id: f.variantId, limit: "" }] }, f.userId);
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } })).preorderLimit).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "product.preorder", entityId: f.productId } })).toBe(2);
    const g = await makeFixture();
    await expect(saveProductPreorder({ productId: f.productId, enabled: true, limits: [{ id: g.variantId, limit: 1 }] }, f.userId)).rejects.toThrow(/không thuộc/);
  });
});
