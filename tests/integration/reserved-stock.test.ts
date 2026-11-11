import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createDocument, postDocument } from "@/server/inventory/documents";
import { createOrder } from "@/server/orders/orders";
import { avail, balance, orderInput, saleFixture, unpublishTestProducts } from "./fixtures";

afterAll(unpublishTestProducts);

// P0-C1 (D2): phiếu kho thủ công không được lấy phần hàng đang giữ cho đơn; không có vượt chặn.

const status = async (id: string) => (await prisma.stockDocument.findUniqueOrThrow({ where: { id } })).status;

describe("Phiếu kho thủ công và hàng đang giữ (P0-C1)", () => {
  it("xuất / điều chỉnh âm / chuyển ra khỏi kho bán chỉ lấy phần chưa giữ; vượt → lỗi kèm mã đơn, phiếu vẫn nháp", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 5 }]);
    const order = await createOrder(orderInput(f, 3), { userId: f.userId });
    expect(await avail(f.variantId)).toBe(2);
    const batch = await prisma.batch.findFirstOrThrow({ where: { variantId: f.variantId, lotNo: "A" } });

    const issue = await createDocument({ type: "ISSUE", fromId: f.mm.id, reason: "Hỏng", lines: [{ variantId: f.variantId, qty: 3 }] }, f.userId);
    await expect(postDocument(issue.id, f.userId)).rejects.toThrow(order.code);
    expect(await status(issue.id)).toBe("DRAFT");

    const adjust = await createDocument({ type: "ADJUST", toId: f.mm.id, reason: "Kiểm kê", lines: [{ variantId: f.variantId, batchId: batch.id, qty: -3 }] }, f.userId);
    await expect(postDocument(adjust.id, f.userId)).rejects.toThrow("đang giữ cho đơn");
    expect(await status(adjust.id)).toBe("DRAFT");

    const transfer = await createDocument({ type: "TRANSFER", fromId: f.mm.id, toId: f.qc.id, lines: [{ variantId: f.variantId, qty: 3 }] }, f.userId);
    await expect(postDocument(transfer.id, f.userId)).rejects.toThrow("đang giữ cho đơn");
    expect(await balance(batch.id, f.mm.id)).toBe(5);

    // Phần chưa giữ thì xuất được; sau đó khả dụng về 0, phần giữ cho đơn còn nguyên.
    const ok = await createDocument({ type: "ISSUE", fromId: f.mm.id, reason: "Hỏng", lines: [{ variantId: f.variantId, qty: 2 }] }, f.userId);
    await postDocument(ok.id, f.userId);
    expect(await balance(batch.id, f.mm.id)).toBe(3);
    expect(await avail(f.variantId)).toBe(0);

    // Điều chỉnh vừa cộng vừa trừ: tính theo thay đổi ròng.
    const net = await createDocument(
      { type: "ADJUST", toId: f.mm.id, reason: "Kiểm kê", lines: [{ variantId: f.variantId, batchId: batch.id, qty: 2 }, { variantId: f.variantId, batchId: batch.id, qty: -2 }] },
      f.userId,
    );
    await postDocument(net.id, f.userId);
    expect(await balance(batch.id, f.mm.id)).toBe(3);
  });

  it("lô cận hạn (ngoài khả dụng bán) vẫn xuất được dù hàng bán được đã giữ hết", async () => {
    const f = await saleFixture([
      { lot: "A", expiryInDays: 400, qty: 3 },
      { lot: "OLD", expiryInDays: 10, qty: 2 },
    ]);
    await createOrder(orderInput(f, 3), { userId: f.userId });
    expect(await avail(f.variantId)).toBe(0);
    const old = await prisma.batch.findFirstOrThrow({ where: { variantId: f.variantId, lotNo: "OLD" } });
    const doc = await createDocument({ type: "ISSUE", fromId: f.mm.id, reason: "Cận hạn", lines: [{ variantId: f.variantId, batchId: old.id, qty: 2 }] }, f.userId);
    await postDocument(doc.id, f.userId);
    expect(await balance(old.id, f.mm.id)).toBe(0);
  });

  it("tạo đơn và ghi phiếu xuất cùng lúc: không deadlock, đúng một bên thành công, khả dụng không âm", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 5 }]);
    const doc = await createDocument({ type: "ISSUE", fromId: f.mm.id, reason: "Hỏng", lines: [{ variantId: f.variantId, qty: 3 }] }, f.userId);
    const results = await Promise.allSettled([createOrder(orderInput(f, 3), { userId: f.userId }), postDocument(doc.id, f.userId)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await avail(f.variantId)).toBe(2);
  });
});
