import { afterAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { prisma } from "@/lib/db";
import { bulkTransition } from "@/server/orders/bulk";
import { createOrder } from "@/server/orders/orders";
import { pickListFor } from "@/server/orders/print-queries";
import { admin, balance, orderInput, saleFixture, unpublishTestProducts } from "./fixtures";

afterAll(unpublishTestProducts);

describe("Thao tác hàng loạt đơn (DT)", () => {
  it("xác nhận → bàn giao → hoàn tất nhiều đơn; đơn sai trạng thái báo riêng, đơn khác vẫn xong; xuất kho đúng một lần", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 10 }]);
    const lot = await prisma.batch.findUniqueOrThrow({ where: { variantId_lotNo: { variantId: f.variantId, lotNo: "A" } } });
    const o1 = await createOrder(orderInput(f, 2), { userId: null });
    const o2 = await createOrder(orderInput(f, 3), { userId: null });
    const bank = await createOrder(orderInput(f, 1, { paymentMethod: "BANK_TRANSFER" }), { userId: null });

    // Đơn chuyển khoản không xác nhận COD được → lỗi riêng, hai đơn COD vẫn xong.
    const confirmed = await bulkTransition({ transition: "confirmCod", ids: [o1.id, bank.id, o2.id] }, admin(f));
    expect(confirmed.map((r) => [r.code, r.ok])).toEqual([
      [o1.code, true],
      [bank.code, false],
      [o2.code, true],
    ]);
    expect(confirmed[1]).toMatchObject({ ok: false, error: { code: "invalid_transition" } });

    const shipped = await bulkTransition({ transition: "ship", ids: [o1.id, o2.id] }, admin(f));
    expect(shipped.every((r) => r.ok)).toBe(true);
    const deliveries = await prisma.delivery.findMany({ where: { orderId: { in: [o1.id, o2.id] } } });
    expect(deliveries.map((d) => d.carrier)).toEqual(["VTP", "VTP"]);
    expect(await balance(lot.id, f.mm.id)).toBe(5);

    // Bàn giao lại → lỗi trạng thái, không xuất kho lần nữa.
    const again = await bulkTransition({ transition: "ship", ids: [o1.id] }, admin(f));
    expect(again[0].ok).toBe(false);
    expect(await balance(lot.id, f.mm.id)).toBe(5);

    const done = await bulkTransition({ transition: "complete", ids: [o1.id, o2.id] }, admin(f));
    expect(done.every((r) => r.ok)).toBe(true);
    const after = await prisma.order.findMany({ where: { id: { in: [o1.id, o2.id] } }, select: { status: true, codCollectedAt: true } });
    expect(after.every((o) => o.status === "COMPLETED" && o.codCollectedAt)).toBe(true);
  });

  it("kiểm quyền theo thao tác; danh sách rỗng / trùng / quá giới hạn bị từ chối; id lạ báo không tìm thấy", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 5 }]);
    const o = await createOrder(orderInput(f, 1), { userId: null });
    await expect(bulkTransition({ transition: "ship", ids: [o.id] }, { userId: f.userId, role: "WAREHOUSE_MANAGER" })).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(bulkTransition({ transition: "cancel", ids: [o.id] }, admin(f))).rejects.toBeInstanceOf(ZodError);
    await expect(bulkTransition({ transition: "confirmCod", ids: [] }, admin(f))).rejects.toBeInstanceOf(ZodError);
    await expect(bulkTransition({ transition: "confirmCod", ids: [o.id, o.id] }, admin(f))).rejects.toBeInstanceOf(ZodError);
    const res = await bulkTransition({ transition: "confirmCod", ids: ["khong-co-don-nay"] }, admin(f));
    expect(res[0]).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("phiếu lấy hàng gộp theo kho bán + SKU, combo bung thành phần", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 20 }]);
    const set = await prisma.variant.create({
      data: { productId: f.productId, sku: `IT-${f.tag}-SET`, label: "Set", priceMmk: 25_000, bundleItems: { create: { componentId: f.variantId, qty: 2 } }, isBundle: true },
    });
    const o1 = await createOrder(orderInput(f, 1), { userId: null });
    const o2 = await createOrder({ ...orderInput(f, 1), items: [{ variantId: set.id, qty: 3 }] }, { userId: null });
    const { orders, groups } = await pickListFor([o2.id, o1.id]);
    expect(orders.map((o) => o.code)).toEqual([o2.code, o1.code]); // giữ thứ tự đã chọn
    expect(groups).toHaveLength(1);
    expect(groups[0].location.id).toBe(f.mm.id);
    expect(groups[0].lines).toEqual([
      // Đơn chưa xác nhận → chưa có lô FEFO (D3-lite chỉ lập lô cho đơn đã xác nhận).
      expect.objectContaining({ sku: `IT-${f.tag}`, qty: 7, lots: [expect.objectContaining({ lotNo: null, qty: 7, orders: [{ code: o2.code, qty: 6 }, { code: o1.code, qty: 1 }] })] }),
    ]);
  });
});
