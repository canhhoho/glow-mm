import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createDocument, postDocument } from "@/server/inventory/documents";
import { addShipmentCost, allocateShipment, createShipment, shipmentAllocationStatus } from "@/server/inventory/shipments";
import { variantCosts } from "@/server/pricing/cost";
import { listVariantsForReceive } from "@/server/inventory/queries";
import { makeFixture, type Fixture } from "./fixtures";

// P1-C (D11) — nhập lại cùng lô với giá khác: giá vốn lô = bình quân theo SL đã nhập (kể cả hàng đã bán).

const recv = (f: Fixture, line: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  createDocument({ type: "RECEIVE", toId: f.mm.id, ...extra, lines: [{ variantId: f.variantId, lotNo: "A", expiryDate: "2029-12-31", ...line }] }, f.userId);
const post = async (f: Fixture, line: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
  const doc = await recv(f, line, extra);
  await postDocument(doc.id, f.userId);
  return doc;
};
const batchOf = (f: Fixture) => prisma.batch.findFirstOrThrow({ where: { variantId: f.variantId, lotNo: "A" } });

describe("Nhập lại cùng lô khác giá (không dùng chuyến hàng)", () => {
  it("được phép; giá vốn lô = bình quân theo SL đã nhập; giá nhập gần nhất = giá lần nhập sau", async () => {
    const f = await makeFixture();
    await post(f, { qty: 10, unitCostVnd: 100_000 });
    expect((await batchOf(f)).unitCostVnd).toBe(100_000);
    await post(f, { qty: 30, unitCostVnd: 120_000 });
    const b = await batchOf(f);
    expect(b.unitCostVnd).toBe(115_000); // (10×100.000 + 30×120.000) / 40
    expect(await prisma.batch.count({ where: { variantId: f.variantId } })).toBe(1);
    const lines = await prisma.stockDocumentLine.findMany({ where: { batchId: b.id }, orderBy: { qty: "asc" } });
    expect(lines.map((l) => [l.qty, l.unitCostVnd])).toEqual([[10, 100_000], [30, 120_000]]);
    expect((await prisma.stockBalance.aggregate({ where: { batchId: b.id }, _sum: { qty: true } }))._sum.qty).toBe(40);
    // Giá để tính giá bán = giá của lần nhập gần nhất (không phải bình quân).
    const cost = (await prisma.$transaction((tx) => variantCosts(tx, [f.variantId], "VND", "PURCHASE"))).get(f.variantId);
    expect(cost?.costVnd).toBe(120_000);
    // Gợi ý giá ở form nhập cũng là giá lần nhập gần nhất.
    expect((await listVariantsForReceive()).find((v) => v.id === f.variantId)?.lastCost).toBe(120_000);
  });

  it("vẫn chặn khác hạn dùng; phiếu nháp chưa ghi sổ không vào giá bình quân", async () => {
    const f = await makeFixture();
    await post(f, { qty: 2, unitCostVnd: 100_000 });
    await expect(recv(f, { qty: 1, unitCostVnd: 100_000, expiryDate: "2030-01-01" })).rejects.toThrow("hạn dùng khác");
    const draft = await recv(f, { qty: 100, unitCostVnd: 900_000 });
    expect((await batchOf(f)).unitCostVnd).toBe(100_000);
    await post(f, { qty: 2, unitCostVnd: 200_000 });
    expect((await batchOf(f)).unitCostVnd).toBe(150_000); // chỉ hai lần đã ghi sổ
    expect((await prisma.stockDocument.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("DRAFT");
  });

  it("giá vốn lô = giá mua × tỷ giá lúc ghi sổ (không phí về kho): payload cũ gửi phí về kho bị bỏ qua", async () => {
    const f = await makeFixture();
    const rate = await prisma.exchangeRate.create({ data: { mmkPerVnd: "0.2", createdById: f.userId } });
    const pinned = async (line: Record<string, unknown>) => {
      const doc = await recv(f, line);
      await prisma.stockDocumentLine.updateMany({ where: { documentId: doc.id }, data: { rateId: rate.id } });
      await postDocument(doc.id, f.userId);
    };
    // `landedCostVnd` (phí về kho) không còn trong phiếu: payload cũ vẫn nhận nhưng bỏ qua.
    await pinned({ qty: 10, unitCostVnd: 100_000, landedCostVnd: 110_000 });
    expect(await batchOf(f)).toMatchObject({ unitCostVnd: 100_000, landedCostVnd: null, landedCostMmk: 20_000 });
    expect((await prisma.stockDocumentLine.findFirstOrThrow({ where: { batchId: (await batchOf(f)).id } })).landedCostVnd).toBeNull();
    await pinned({ qty: 10, unitCostVnd: 120_000 });
    expect(await batchOf(f)).toMatchObject({ unitCostVnd: 110_000, landedCostMmk: 22_000 }); // (10×100.000 + 10×120.000)/20 × 0,2
  });

  it("lô cũ đã có giá vốn gồm phí: giữ nguyên cho tới khi lô nhận thêm một phiếu nhập — khi đó tính lại theo giá mua × tỷ giá", async () => {
    const f = await makeFixture();
    const rate = await prisma.exchangeRate.create({ data: { mmkPerVnd: "0.2", createdById: f.userId } });
    await post(f, { qty: 10, unitCostVnd: 100_000 });
    // Mô phỏng dữ liệu cũ: giá vốn từng gồm phí về kho.
    await prisma.batch.updateMany({ where: { variantId: f.variantId, lotNo: "A" }, data: { landedCostVnd: 110_000, landedCostMmk: 22_000 } });
    expect(await batchOf(f)).toMatchObject({ landedCostVnd: 110_000, landedCostMmk: 22_000 });
    await recv(f, { qty: 5, unitCostVnd: 100_000 }); // phiếu nháp chưa ghi sổ không đụng
    expect(await batchOf(f)).toMatchObject({ landedCostMmk: 22_000 });
    const doc = await recv(f, { qty: 5, unitCostVnd: 100_000 });
    await prisma.stockDocumentLine.updateMany({ where: { documentId: doc.id }, data: { rateId: rate.id } });
    await postDocument(doc.id, f.userId);
    expect(await batchOf(f)).toMatchObject({ landedCostVnd: null, landedCostMmk: expect.any(Number) });
  });

  it("ghi sổ phiếu nhập hàng VND khi chưa có tỷ giá nào → bị chặn, phiếu vẫn nháp, không sinh lô thiếu giá vốn", async () => {
    const f = await makeFixture();
    const doc = await recv(f, { qty: 3, unitCostVnd: 100_000 });
    // Đẩy mọi tỷ giá ra tương lai (latestRate bỏ qua tỷ giá chưa hiệu lực) rồi trả lại.
    const rates = await prisma.exchangeRate.findMany({ select: { id: true, effectiveAt: true } });
    const future = new Date(Date.now() + 365 * 86_400_000);
    await prisma.exchangeRate.updateMany({ data: { effectiveAt: future } });
    try {
      await expect(postDocument(doc.id, f.userId)).rejects.toThrow("tỷ giá");
      expect((await prisma.stockDocument.findUniqueOrThrow({ where: { id: doc.id } })).status).toBe("DRAFT");
      expect(await prisma.stockBalance.count({ where: { batch: { variantId: f.variantId } } })).toBe(0);
    } finally {
      for (const r of rates) await prisma.exchangeRate.update({ where: { id: r.id }, data: { effectiveAt: r.effectiveAt } });
    }
    await postDocument(doc.id, f.userId); // có tỷ giá lại → ghi sổ được, lô có giá vốn
    expect((await batchOf(f)).landedCostMmk).not.toBeNull();
  });

  it("hai lần nhập khác tỷ giá: giá vốn MMK đổi từng lần theo tỷ giá của nó", async () => {
    const f = await makeFixture();
    const [r1, r2] = await Promise.all([
      prisma.exchangeRate.create({ data: { mmkPerVnd: "0.17", createdById: f.userId } }),
      prisma.exchangeRate.create({ data: { mmkPerVnd: "0.18", createdById: f.userId } }),
    ]);
    const pinned = async (rate: { id: string }, qty: number) => {
      const doc = await recv(f, { qty, unitCostVnd: 100_000 });
      await prisma.stockDocumentLine.updateMany({ where: { documentId: doc.id }, data: { rateId: rate.id } });
      await postDocument(doc.id, f.userId);
    };
    await pinned(r1, 10);
    await pinned(r2, 30);
    expect((await batchOf(f)).landedCostMmk).toBe(17_750); // (10×17.000 + 30×18.000) / 40
  });
});

describe("Nhập lại cùng lô trong một chuyến hàng", () => {
  it("phân bổ chi phí theo SL và giá bình quân; chuyến báo 'cũ' sau lần nhập thứ hai; chặn nhập lẫn chuyến / không chuyến", async () => {
    const f = await makeFixture();
    const sh = await createShipment({ code: `SH-${f.tag}`, allocationMethod: "BY_VALUE" });
    await post(f, { qty: 10, unitCostVnd: 100_000 }, { shipmentId: sh.id });
    await addShipmentCost({ shipmentId: sh.id, type: "SHIPPING", amountVnd: 40_000 });
    await allocateShipment(sh.id, f.userId);
    expect((await batchOf(f)).landedCostVnd).toBe(104_000); // 100.000 + 40.000 / 10
    expect((await shipmentAllocationStatus(sh.id)).state).toBe("ALLOCATED");

    await post(f, { qty: 30, unitCostVnd: 120_000 }, { shipmentId: sh.id });
    expect((await batchOf(f)).unitCostVnd).toBe(115_000);
    expect((await shipmentAllocationStatus(sh.id)).state).toBe("STALE"); // SL và giá đổi → phải phân bổ lại
    expect((await batchOf(f)).landedCostVnd).toBe(104_000); // chưa tự đổi

    await allocateShipment(sh.id, f.userId);
    expect((await batchOf(f)).landedCostVnd).toBe(116_000); // 115.000 + 40.000 / 40
    expect((await shipmentAllocationStatus(sh.id)).state).toBe("ALLOCATED");

    // Lô thuộc chuyến: nhập thêm không chuyến hoặc chuyến khác vẫn bị chặn (không thêm bước chọn chuyến).
    await expect(recv(f, { qty: 1, unitCostVnd: 100_000 })).rejects.toThrow("chuyến hàng khác");
    const other = await createShipment({ code: `SH2-${f.tag}` });
    await expect(recv(f, { qty: 1, unitCostVnd: 100_000 }, { shipmentId: other.id })).rejects.toThrow("chuyến hàng khác");
  });
});
