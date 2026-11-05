import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tx } from "@/server/inventory/ledger";

const inventory = vi.hoisted(() => ({
  candidatesAt: vi.fn(),
  postDocumentTx: vi.fn(),
  bundleDefs: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/server/inventory/documents", () => ({ ...inventory, salesBlockDays: vi.fn() }));
vi.mock("@/server/orders/availability", () => ({ bundleDefs: inventory.bundleDefs }));
vi.mock("@/server/orders/reservations", () => ({ holdIndefinitely: vi.fn(), releaseReservations: vi.fn() }));

import { transitionInTx } from "@/server/orders/transitions";

const now = new Date("2026-11-03T06:00:00Z");
const actor = { userId: "staff", role: "ORDER_STAFF" as const };

function fixture(status: "COD_CONFIRMED" | "PAYMENT_CONFIRMED" | "PACKING" = "COD_CONFIRMED") {
  const order = { id: "order", code: "OD-TEST", status, paymentMethod: status === "PAYMENT_CONFIRMED" ? "BANK_TRANSFER" : "COD" };
  const tx = {
    $queryRaw: vi.fn(),
    order: { findUnique: vi.fn().mockImplementation(async () => ({ ...order })), update: vi.fn().mockImplementation(({ data }) => ({ ...Object.assign(order, data) })) },
    location: { findMany: vi.fn().mockResolvedValue([{ id: "warehouse", name: "Kho Thắm", sellable: true }]) },
    // P24: kho xuất lấy theo kho của SP.
    orderItem: { findMany: vi.fn().mockResolvedValue([{ id: "item", variantId: "variant", qty: 2, variant: { product: { stockLocationId: "warehouse" } } }]) },
    stockDocument: { create: vi.fn().mockResolvedValue({ id: "issue" }) },
    batch: { findMany: vi.fn().mockResolvedValue([{ id: "batch", landedCostMmk: 4000 }]) },
    orderAllocation: { createMany: vi.fn() },
    reservation: { updateMany: vi.fn() },
    delivery: { create: vi.fn() },
    orderStatusHistory: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  const handover = () => transitionInTx(tx as unknown as Tx, order.id, "ship", actor, { fromLocationId: "warehouse", carrier: "Test" }, { now, blockDays: 60 });
  return { tx, handover };
}

beforeEach(() => {
  vi.clearAllMocks();
  inventory.bundleDefs.mockResolvedValue(new Map());
  inventory.candidatesAt.mockResolvedValue([{ batchId: "batch", available: 5, expiryDate: new Date("2028-01-01"), receivedAt: now }]);
});

describe("Bàn giao vận chuyển trong quy trình 4 bước", () => {
  it.each(["COD_CONFIRMED", "PAYMENT_CONFIRMED"] as const)("%s: xuất kho, tiêu thụ giữ hàng và lưu người bàn giao cùng bước", async (status) => {
    const { tx, handover } = fixture(status);
    await expect(handover()).resolves.toMatchObject({ status: "SHIPPING" });
    expect(inventory.postDocumentTx).toHaveBeenCalledWith(tx, "issue", actor.userId);
    expect(tx.stockDocument.create).toHaveBeenCalledTimes(1);
    expect(tx.orderAllocation.createMany).toHaveBeenCalledWith({ data: [{ orderItemId: "item", batchId: "batch", qty: 2, unitLandedCostMmk: 4000, costStatus: "ACTUAL" }] });
    expect(tx.reservation.updateMany).toHaveBeenCalledWith({ where: { orderId: "order", status: "ACTIVE" }, data: { status: "CONSUMED" } });
    expect(tx.orderStatusHistory.create).toHaveBeenCalledWith({ data: expect.objectContaining({ fromStatus: status, toStatus: "SHIPPING", userId: actor.userId }) });
    await expect(handover()).rejects.toMatchObject({ code: "invalid_transition" });
    expect(tx.stockDocument.create).toHaveBeenCalledTimes(1);
    expect(tx.delivery.create).toHaveBeenCalledTimes(1);
  });

  it("đơn PACKING cũ chỉ tạo vận chuyển, không xuất kho lại", async () => {
    const { tx, handover } = fixture("PACKING");
    await expect(handover()).resolves.toMatchObject({ status: "SHIPPING" });
    expect(tx.stockDocument.create).not.toHaveBeenCalled();
    expect(inventory.postDocumentTx).not.toHaveBeenCalled();
    expect(tx.delivery.create).toHaveBeenCalledTimes(1);
  });

  it("captures the estimated cost and its status when shipping", async () => {
    const { tx, handover } = fixture();
    tx.batch.findMany.mockResolvedValue([{ id: "batch", landedCostMmk: null, estimatedCostMmk: 4500 }]);
    await handover();
    expect(tx.orderAllocation.createMany).toHaveBeenCalledWith({ data: [{ orderItemId: "item", batchId: "batch", qty: 2, unitLandedCostMmk: 4500, costStatus: "ESTIMATED" }] });
  });

  it("thiếu tồn không chuyển trạng thái hay tạo vận chuyển", async () => {
    inventory.candidatesAt.mockResolvedValue([]);
    const { tx, handover } = fixture();
    await expect(handover()).rejects.toMatchObject({ code: "out_of_stock" });
    expect(tx.order.update).not.toHaveBeenCalled();
    expect(tx.delivery.create).not.toHaveBeenCalled();
  });
});
