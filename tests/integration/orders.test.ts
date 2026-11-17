import Rabbit from "rabbit-node";
import { afterAll, describe, expect, it, vi } from "vitest";
// Kiểm quy tắc hạn dùng → chạy với cờ hạn dùng BẬT (production đang tắt, 17/11/2026; hành vi tắt: expiry-off.test.ts).
vi.mock("@/lib/features", async (orig) => (await import("../support/expiry-on")).expiryOn(orig));
import { prisma } from "@/lib/db";
import { listOrdersAdmin } from "@/server/orders/admin-queries";
import { cancelExpiredOrders } from "@/server/orders/cron";
import { OrderError } from "@/server/orders/errors";
import { createOrder } from "@/server/orders/orders";
import { transitionInTx, transitionOrder } from "@/server/orders/transitions";
import { admin, avail, balance, orderInput, saleFixture, unpublishTestProducts } from "./fixtures";

const DAY = 24 * 60 * 60 * 1000;

// Sản phẩm test phải "đã đăng" mới đặt được; gỡ đăng khi xong để không lẫn vào storefront của E2E (cùng DB glow_test).
afterAll(unpublishTestProducts);

describe("Tạo đơn + giữ hàng", () => {
  it("tạo đơn: giá từ DB, không tính phí ship (VTP thu khi giao), snapshot địa chỉ VTP, giữ hàng làm giảm khả dụng", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 10 }]);
    const order = await createOrder(orderInput(f, 3, { phone2: "09 4000 1111" }), { userId: null });
    expect(order).toMatchObject({
      status: "PENDING",
      channel: "WEB",
      recipientPhone: "0978123456",
      recipientPhone2: "0940001111",
      subtotalMmk: 30_000,
      shippingFeeMmk: 0,
      totalMmk: 30_000,
      townshipId: "tw-YGN-WYG-KMY",
      stateCode: "YGN",
      districtCode: "WYG",
      townshipCode: "KMY",
    });
    expect(order.zoneName).toBe("Kamaryut, Yangon (West), Yangon (ကမာရွတ်)");
    const address = await prisma.address.findUniqueOrThrow({ where: { id: order.addressId } });
    expect(address.townshipId).toBe("tw-YGN-WYG-KMY");
    const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
    expect(items[0]).toMatchObject({ sku: `IT-${f.tag}`, qty: 3, unitPriceMmk: 10_000 });
    expect(await avail(f.variantId)).toBe(7);
  });

  it("địa chỉ VTP không hợp lệ / thị trấn hoặc cấp trên bị tắt → invalid_zone; SĐT phụ sai → invalid_phone", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 5 }]);
    await expect(createOrder(orderInput(f, 1, { townshipId: "tw-khong-co" }), { userId: null })).rejects.toMatchObject({
      code: "invalid_zone",
    });
    await expect(createOrder(orderInput(f, 1, { phone2: "12345" }), { userId: null })).rejects.toMatchObject({ code: "invalid_phone" });
    // Tắt huyện Yangon (South) → thị trấn Dala thuộc huyện đó không đặt được.
    await prisma.mmDistrict.update({ where: { id: "ds-YGN-SYG" }, data: { active: false } });
    try {
      await expect(createOrder(orderInput(f, 1, { townshipId: "tw-YGN-SYG-DLA" }), { userId: null })).rejects.toMatchObject({
        code: "invalid_zone",
      });
    } finally {
      await prisma.mmDistrict.update({ where: { id: "ds-YGN-SYG" }, data: { active: true } });
    }
  });

  it("đặt quá tồn → out_of_stock, không tạo đơn", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 2 }]);
    await expect(createOrder(orderInput(f, 3), { userId: null })).rejects.toMatchObject({ code: "out_of_stock" });
    expect(await prisma.order.count({ where: { items: { some: { variantId: f.variantId } } } })).toBe(0);
  });

  it("giá bán ≤ 0 → price_missing cho cả đơn web lẫn đơn nhân viên, không tạo đơn, không giữ hàng", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 5 }]);
    await prisma.variant.update({ where: { id: f.variantId }, data: { priceMmk: 0 } });
    await expect(createOrder(orderInput(f, 1), { userId: null })).rejects.toMatchObject({
      code: "price_missing",
      details: { sku: `IT-${f.tag}` },
    });
    await expect(createOrder({ ...orderInput(f, 1), channel: "VIBER" }, { userId: f.userId })).rejects.toMatchObject({
      code: "price_missing",
    });
    expect(await prisma.order.count({ where: { items: { some: { variantId: f.variantId } } } })).toBe(0);
    expect(await avail(f.variantId)).toBe(5);
  });

  it("tên/địa chỉ gõ bằng Zawgyi được lưu dạng Unicode", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 2 }]);
    const name = "မမြင့်မြင့်";
    const address = "အမှတ် ၁၂၊ ဗိုလ်အောင်ကျော်လမ်း";
    const order = await createOrder(
      orderInput(f, 1, { name: Rabbit.uni2zg(name), addressLine: Rabbit.uni2zg(address), phone: "၀၉၇၈၁၂၃၄၅၆" }),
      { userId: null },
    );
    expect(order).toMatchObject({ recipientName: name, addressText: address, recipientPhone: "0978123456" });
  });

  it("tắt nhận đơn web → chặn đơn khách (checkout_disabled), đơn tạo tay vẫn được", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 5 }]);
    const key = "store.checkoutEnabled";
    const before = await prisma.setting.findUnique({ where: { key } });
    await prisma.setting.upsert({ where: { key }, update: { value: false }, create: { key, value: false } });
    try {
      await expect(createOrder(orderInput(f, 1), { userId: null })).rejects.toMatchObject({ code: "checkout_disabled" });
      const manual = await createOrder({ ...orderInput(f, 1), channel: "VIBER" }, { userId: f.userId });
      expect(manual.channel).toBe("VIBER");
    } finally {
      if (before) await prisma.setting.update({ where: { key }, data: { value: before.value ?? true } });
      else await prisma.setting.delete({ where: { key } });
    }
  });

  it("SĐT sai → invalid_phone", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 2 }]);
    await expect(createOrder(orderInput(f, 1, { phone: "12345" }), { userId: null })).rejects.toBeInstanceOf(OrderError);
  });

  it("hai đơn đồng thời không bán vượt tồn", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 5 }]);
    const results = await Promise.allSettled([
      createOrder(orderInput(f, 3), { userId: null }),
      createOrder(orderInput(f, 3, { phone: "09781234567" }), { userId: null }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "out_of_stock" });
    expect(await avail(f.variantId)).toBe(2);
  });

  it("idempotencyKey: gửi lại trả về cùng đơn", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 5 }]);
    const key = `it-${f.tag}-idem`;
    const a = await createOrder(orderInput(f, 2, { idempotencyKey: key }), { userId: null });
    const b = await createOrder(orderInput(f, 2, { idempotencyKey: key }), { userId: null });
    expect(b.id).toBe(a.id);
    expect(await avail(f.variantId)).toBe(3);
  });

  it("lô dưới ngưỡng hạn dùng không tính vào khả dụng", async () => {
    const f = await saleFixture([
      { lot: "OLD", expiryInDays: 30, qty: 5 },
      { lot: "NEW", expiryInDays: 400, qty: 2 },
    ]);
    expect(await avail(f.variantId)).toBe(2);
    await expect(createOrder(orderInput(f, 3), { userId: null })).rejects.toMatchObject({ code: "out_of_stock" });
  });

  it("combo giữ hàng trên biến thể thành phần", async () => {
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
    expect(await avail(bundle.id)).toBe(5);
    const order = await createOrder(
      { ...orderInput(f, 1), items: [{ variantId: bundle.id, qty: 2 }] },
      { userId: null },
    );
    const res = await prisma.reservation.findMany({ where: { orderId: order.id } });
    expect(res).toEqual([expect.objectContaining({ variantId: f.variantId, qty: 4, status: "ACTIVE" })]);
    expect(await avail(f.variantId)).toBe(6);
    expect(await avail(bundle.id)).toBe(3);
  });
});

describe("Chuyển trạng thái + xuất kho FEFO khi bàn giao", () => {
  it("hai yêu cầu bàn giao đồng thời chỉ xuất kho và tạo vận chuyển một lần", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 10 }]);
    const order = await createOrder(orderInput(f, 2), { userId: null });
    await transitionOrder(order.id, "confirmCod", admin(f));
    const results = await Promise.allSettled([
      transitionOrder(order.id, "ship", admin(f), { fromLocationId: f.mm.id, carrier: "Test" }),
      transitionOrder(order.id, "ship", admin(f), { fromLocationId: f.mm.id, carrier: "Test" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "invalid_transition" });
    expect(await prisma.stockDocument.count({ where: { orderId: order.id, type: "ISSUE" } })).toBe(1);
    expect(await prisma.delivery.count({ where: { orderId: order.id } })).toBe(1);
    const [batch] = await prisma.batch.findMany({ where: { variantId: f.variantId } });
    expect(await balance(batch.id, f.mm.id)).toBe(8);
  });

  it("lỗi sau ghi sổ hoàn tác cả kho, phân lô, giữ hàng, lịch sử và vận chuyển", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 10 }]);
    const order = await createOrder(orderInput(f, 2), { userId: null });
    await transitionOrder(order.id, "confirmCod", admin(f));
    await expect(prisma.$transaction(async (tx) => {
      await transitionInTx(tx, order.id, "ship", admin(f), { fromLocationId: f.mm.id, carrier: "Test" }, { now: new Date(), blockDays: 90 });
      throw new Error("Simulated failure after stock issue");
    })).rejects.toThrow("Simulated failure");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("COD_CONFIRMED");
    expect(await prisma.stockDocument.count({ where: { orderId: order.id } })).toBe(0);
    expect(await prisma.delivery.count({ where: { orderId: order.id } })).toBe(0);
    expect(await prisma.orderAllocation.count({ where: { orderItem: { orderId: order.id } } })).toBe(0);
    expect(await prisma.orderStatusHistory.count({ where: { orderId: order.id, toStatus: "SHIPPING" } })).toBe(0);
    expect((await prisma.reservation.findFirstOrThrow({ where: { orderId: order.id } })).status).toBe("ACTIVE");
    const [batch] = await prisma.batch.findMany({ where: { variantId: f.variantId } });
    expect(await balance(batch.id, f.mm.id)).toBe(10);
  });

  it("COD: xác nhận → bàn giao (xuất kho FEFO) → hoàn tất; ledger khớp", async () => {
    const f = await saleFixture([
      { lot: "NEAR", expiryInDays: 30, qty: 5 },
      { lot: "MID", expiryInDays: 300, qty: 3 },
      { lot: "FAR", expiryInDays: 600, qty: 10 },
    ], { cost: false });
    const batches = await prisma.batch.findMany({ where: { variantId: f.variantId } });
    const lot = (no: string) => batches.find((b) => b.lotNo === no)!;
    await prisma.batch.update({ where: { id: lot("MID").id }, data: { landedCostMmk: 4000 } });

    const order = await createOrder(orderInput(f, 5), { userId: null });
    await expect(transitionOrder(order.id, "ship", admin(f), { fromLocationId: f.mm.id })).rejects.toMatchObject({
      code: "invalid_transition",
    });
    await transitionOrder(order.id, "confirmCod", admin(f));
    expect((await prisma.reservation.findFirstOrThrow({ where: { orderId: order.id } })).expiresAt).toBeNull();

    // 16/11: lô FAR (sẽ xuất 2 cái) chưa có giá vốn → chặn bàn giao, tồn không đổi.
    await expect(transitionOrder(order.id, "ship", admin(f), { fromLocationId: f.mm.id, carrier: "Royal Express" })).rejects.toMatchObject({
      code: "cost_missing",
      details: { lots: [{ lotNo: "FAR" }] },
    });
    expect(await balance(lot("FAR").id, f.mm.id)).toBe(10);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("COD_CONFIRMED");
    // Giá vốn tạm → cho bàn giao, đánh dấu ESTIMATED.
    await prisma.batch.update({ where: { id: lot("FAR").id }, data: { estimatedCostMmk: 3000 } });
    const shipped = await transitionOrder(order.id, "ship", admin(f), { fromLocationId: f.mm.id, carrier: "Royal Express", trackingNo: "RX123" });
    expect(shipped.status).toBe("SHIPPING");
    expect(await prisma.delivery.findFirst({ where: { orderId: order.id } })).toMatchObject({ carrier: "Royal Express", trackingNo: "RX123" });
    expect(await balance(lot("NEAR").id, f.mm.id)).toBe(5);
    expect(await balance(lot("MID").id, f.mm.id)).toBe(0);
    expect(await balance(lot("FAR").id, f.mm.id)).toBe(8);

    const allocs = await prisma.orderAllocation.findMany({ where: { orderItem: { orderId: order.id } } });
    expect(allocs.map((a) => [a.batchId, a.qty, a.unitLandedCostMmk, a.costStatus]).sort()).toEqual(
      [
        [lot("MID").id, 3, 4000, "ACTUAL"],
        [lot("FAR").id, 2, 3000, "ESTIMATED"],
      ].sort(),
    );
    const res = await prisma.reservation.findMany({ where: { orderId: order.id } });
    expect(res.every((r) => r.status === "CONSUMED")).toBe(true);
    expect(await avail(f.variantId)).toBe(8);

    const doc = await prisma.stockDocument.findFirstOrThrow({ where: { orderId: order.id } });
    expect(doc).toMatchObject({ type: "ISSUE", status: "POSTED" });
    for (const b of batches) {
      const sum = await prisma.stockLedger.aggregate({ where: { batchId: b.id }, _sum: { qtyDelta: true } });
      const bal = await prisma.stockBalance.aggregate({ where: { batchId: b.id }, _sum: { qty: true } });
      expect(sum._sum.qtyDelta).toBe(bal._sum.qty);
    }

    await expect(transitionOrder(order.id, "cancel", admin(f))).rejects.toMatchObject({ code: "invalid_transition" });
    const done = await transitionOrder(order.id, "complete", admin(f));
    expect(done).toMatchObject({ status: "COMPLETED", paymentStatus: "PAID" });
    const history = await prisma.orderStatusHistory.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "asc" } });
    expect(history.map((h) => h.toStatus)).toEqual(["PENDING", "COD_CONFIRMED", "SHIPPING", "COMPLETED"]);
  });

  it("đóng gói combo trừ kho từng thành phần", async () => {
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
    const order = await createOrder({ ...orderInput(f, 1), items: [{ variantId: bundle.id, qty: 3 }] }, { userId: null });
    await transitionOrder(order.id, "confirmCod", admin(f));
    await transitionOrder(order.id, "ship", admin(f), { fromLocationId: f.mm.id });
    const [batch] = await prisma.batch.findMany({ where: { variantId: f.variantId } });
    expect(await balance(batch.id, f.mm.id)).toBe(4);
  });

  it("huỷ nhả hàng; kiểm quyền theo vai trò; hệ thống chỉ được huỷ", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 5 }]);
    const order = await createOrder(orderInput(f, 4), { userId: null });
    await expect(
      transitionOrder(order.id, "confirmCod", { userId: f.userId, role: "WAREHOUSE_MANAGER" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(transitionOrder(order.id, "confirmCod", { system: true })).rejects.toMatchObject({ code: "forbidden" });

    const cancelled = await transitionOrder(order.id, "cancel", { userId: f.userId, role: "ORDER_STAFF" }, { reason: "Khách huỷ" });
    expect(cancelled).toMatchObject({ status: "CANCELLED", cancelReason: "Khách huỷ" });
    expect(await avail(f.variantId)).toBe(5);
  });
});

describe("Hết hạn giữ hàng + cron", () => {
  it("giữ hàng quá hạn không trừ khả dụng; cron huỷ đơn COD chưa xác nhận", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 5 }]);
    const order = await createOrder(orderInput(f, 4), { userId: null, now: new Date(Date.now() - 2 * DAY) });
    expect(await avail(f.variantId)).toBe(5);

    const r = await cancelExpiredOrders("COD");
    expect(r.errors).toEqual([]);
    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after).toMatchObject({ status: "CANCELLED", cancelReason: "Quá hạn gọi xác nhận COD" });
    expect((await prisma.reservation.findFirstOrThrow({ where: { orderId: order.id } })).status).toBe("RELEASED");
  });

  it("xác nhận COD trễ: giữ lại được nếu còn hàng, báo hết hàng nếu đã bị đơn khác lấy", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 5 }]);
    const late = await createOrder(orderInput(f, 4), { userId: null, now: new Date(Date.now() - 2 * DAY) });
    await createOrder(orderInput(f, 3, { phone: "09781234567" }), { userId: null });
    await expect(transitionOrder(late.id, "confirmCod", admin(f))).rejects.toMatchObject({ code: "out_of_stock" });

    const late2 = await createOrder(orderInput(f, 2), { userId: null });
    await prisma.reservation.updateMany({ where: { orderId: late2.id }, data: { expiresAt: new Date(Date.now() - DAY) } });
    const ok = await transitionOrder(late2.id, "confirmCod", admin(f));
    expect(ok.status).toBe("COD_CONFIRMED");
  });
});

describe("Chuyển khoản: đối chiếu tiền thực nhận → xác nhận", () => {
  it("nhân viên xác nhận tiền thực nhận, không cần tải biên lai", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 5 }]);
    const order = await createOrder(orderInput(f, 2, { paymentMethod: "BANK_TRANSFER" }), { userId: null });
    expect((await listOrdersAdmin({ status: "PENDING", paymentMethod: "BANK_TRANSFER", q: order.code })).map((o) => o.id)).toEqual([order.id]);
    expect(await listOrdersAdmin({ status: "PENDING", paymentMethod: "COD", q: order.code })).toEqual([]);
    await expect(transitionOrder(order.id, "confirmPayment", { userId: f.userId, role: "WAREHOUSE_MANAGER" })).rejects.toMatchObject({ code: "forbidden" });
    const confirmed = await transitionOrder(order.id, "confirmPayment", { userId: f.userId, role: "ORDER_STAFF" });
    expect(confirmed).toMatchObject({ status: "PAYMENT_CONFIRMED", paymentStatus: "PAID" });
    expect((await listOrdersAdmin({ status: "PREPARING", q: order.code })).map((o) => o.id)).toEqual([order.id]);
    expect(await prisma.paymentProof.count({ where: { orderId: order.id } })).toBe(0);
    expect((await prisma.reservation.findFirstOrThrow({ where: { orderId: order.id } })).expiresAt).toBeNull();
    const shipped = await transitionOrder(order.id, "ship", { userId: f.userId, role: "ORDER_STAFF" }, { fromLocationId: f.mm.id });
    expect(shipped.status).toBe("SHIPPING");
    await expect(transitionOrder(order.id, "ship", admin(f))).rejects.toMatchObject({ code: "invalid_transition" });
    expect(await prisma.stockDocument.count({ where: { orderId: order.id, type: "ISSUE" } })).toBe(1);
  });

  it("cron huỷ đơn chuyển khoản quá hạn chưa nhận tiền", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 5 }]);
    const order = await createOrder(orderInput(f, 2, { paymentMethod: "BANK_TRANSFER" }), {
      userId: null,
      now: new Date(Date.now() - 2 * DAY),
    });
    await cancelExpiredOrders("BANK_TRANSFER");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("CANCELLED");
  });
});

describe("Tìm đơn trong admin", () => {
  it("gõ số → khớp một phần SĐT; từ khoá có chữ không so SĐT (\"abc123\" không ra mọi SĐT chứa 123)", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 5 }]);
    const tail = String(Date.now()).slice(-7);
    const order = await createOrder(orderInput(f, 1, { name: `Tim Kiem ${f.tag}`, phone: `09${tail}` }), { userId: null });
    const ids = async (q: string) => (await listOrdersAdmin({ q })).map((o) => o.id);

    expect(await ids(tail.slice(-5))).toContain(order.id);
    expect(await ids(`+95 9 ${tail}`)).toContain(order.id);
    expect(await ids(`khongtontai${tail.slice(-5)}`)).not.toContain(order.id);
    expect(await ids(`tim kiem ${f.tag}`)).toEqual([order.id]);
  });
});
