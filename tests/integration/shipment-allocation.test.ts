import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createDocument, postDocument } from "@/server/inventory/documents";
import { addShipmentCost, allocateShipment, attachBatchToShipment, createShipment, shipmentAllocationStatus } from "@/server/inventory/shipments";
import { makeFixture } from "./fixtures";

describe("D8 phân bổ theo khối lượng và dấu kiểm", () => {
  it("thiếu kg chặn, số nhập gồm tester, lịch sử và cảnh báo đầu vào đổi", async () => {
    const f = await makeFixture();
    const sh = await createShipment({ code: `SH-${f.tag}`, allocationMethod: "BY_WEIGHT" });
    const second = await prisma.variant.create({ data: { productId: f.productId, sku: `${f.tag}-HEAVY`, label: "Heavy", priceMmk: 10000, weightGrams: 300 } });
    const receipt = await createDocument({ type: "RECEIVE", toId: f.mm.id, shipmentId: sh.id, lines: [{ variantId: f.variantId, lotNo: "A", expiryDate: "2028-01-01", qty: 2, unitCostVnd: 1000 }, { variantId: second.id, lotNo: "B", expiryDate: "2028-01-01", qty: 2, stockType: "TESTER", unitCostVnd: 1000 }] }, f.userId);
    await postDocument(receipt.id, f.userId);
    await addShipmentCost({ shipmentId: sh.id, type: "SHIPPING", amountVnd: 800 });
    await expect(allocateShipment(sh.id, f.userId)).rejects.toThrow(f.tag);
    expect((await shipmentAllocationStatus(sh.id)).state).toBe("UNALLOCATED");
    await prisma.variant.update({ where: { id: f.variantId }, data: { weightGrams: 100 } });
    const result = await allocateShipment(sh.id, f.userId);
    const batches = await prisma.batch.findMany({ where: { shipmentId: sh.id } });
    expect(result.find(r => r.key === batches.find(b => b.variantId === f.variantId)!.id)?.allocatedVnd).toBe(200);
    expect(result.reduce((s,r)=>s+r.allocatedVnd,0)).toBe(800);
    expect((await shipmentAllocationStatus(sh.id)).state).toBe("ALLOCATED");
    await prisma.variant.update({ where: { id: f.variantId }, data: { weightGrams: 150 } });
    expect((await shipmentAllocationStatus(sh.id)).state).toBe("STALE");
    // Cảnh báo không tự sửa giá vốn cũ.
    expect((await prisma.batch.findUniqueOrThrow({ where: { id: batches.find(b=>b.variantId===f.variantId)!.id } })).landedCostVnd).toBe(1100);
    await allocateShipment(sh.id, f.userId);
    expect((await shipmentAllocationStatus(sh.id)).history).toHaveLength(2);
    await addShipmentCost({ shipmentId: sh.id, type: "FEE", amountVnd: 1 });
    expect((await shipmentAllocationStatus(sh.id)).state).toBe("STALE");
    // Chọn phương pháp và ghi lịch sử trong cùng transaction.
    await allocateShipment(sh.id, f.userId, "BY_QTY");
    const latest = await shipmentAllocationStatus(sh.id);
    expect(latest.state).toBe("ALLOCATED");
    expect(latest.history[0].method).toBe("BY_QTY");
  });

  it("chuyến tùy chọn, gắn lô tường minh và chặn phiếu dùng lô chuyến khác", async () => {
    const f = await makeFixture();
    const lines = [{ variantId: f.variantId, lotNo: "A", expiryDate: "2028-01-01", qty: 2, unitCostVnd: 1000 }];
    const doc = await createDocument({ type: "RECEIVE", toId: f.mm.id, lines }, f.userId);
    await postDocument(doc.id, f.userId);
    const batch = await prisma.batch.findFirstOrThrow({ where: { variantId: f.variantId } });
    const sh = await createShipment({ code: `SH-${f.tag}` });
    await expect(createDocument({ type: "RECEIVE", toId: f.mm.id, shipmentId: sh.id, lines }, f.userId)).rejects.toThrow("chuyến hàng khác");
    await attachBatchToShipment({ batchId: batch.id, shipmentId: sh.id }, f.userId);
    expect((await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } })).shipmentId).toBe(sh.id);
    await expect(attachBatchToShipment({ batchId: batch.id, shipmentId: sh.id }, f.userId)).rejects.toThrow();
    await expect(createDocument({ type: "RECEIVE", toId: f.mm.id, lines }, f.userId)).rejects.toThrow("chuyến hàng khác");
    await expect(createDocument({ type: "RECEIVE", toId: f.mm.id, shipmentId: sh.id, lines }, f.userId)).resolves.toBeTruthy();
  });
});
