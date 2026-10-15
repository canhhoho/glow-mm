import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cancelDocument, createDocument, postDocument } from "@/server/inventory/documents";
import { addShipmentCost, allocateShipment, createShipment } from "@/server/inventory/shipments";
import { balance, makeFixture, type Fixture } from "./fixtures";

async function receive(
  f: Fixture,
  lots: { lot: string; expiry: string; qty: number; cost?: number }[],
  shipmentId?: string,
) {
  const doc = await createDocument(
    {
      type: "RECEIVE",
      toId: f.vn.id,
      shipmentId,
      lines: lots.map((l) => ({
        variantId: f.variantId,
        lotNo: l.lot,
        expiryDate: l.expiry,
        unitCostVnd: l.cost ?? 100_000,
        qty: l.qty,
      })),
    },
    f.userId,
  );
  await postDocument(doc.id, f.userId);
  return prisma.batch.findMany({ where: { variantId: f.variantId }, orderBy: { expiryDate: "asc" } });
}

describe("Sổ kho: nhận → chuyển → xuất", () => {
  it("nhận tạo lô + tồn, chuyển theo FEFO, xuất trừ tồn, ledger khớp tồn", async () => {
    const f = await makeFixture();
    const [early, late] = await receive(f, [
      { lot: "A", expiry: "2027-06-30", qty: 10 },
      { lot: "B", expiry: "2028-06-30", qty: 20 },
    ]);
    expect(await balance(early.id, f.vn.id)).toBe(10);
    expect(await balance(late.id, f.vn.id)).toBe(20);

    const tf = await createDocument(
      { type: "TRANSFER", fromId: f.vn.id, toId: f.mm.id, lines: [{ variantId: f.variantId, qty: 15 }] },
      f.userId,
    );
    await postDocument(tf.id, f.userId);
    expect(await balance(early.id, f.vn.id)).toBe(0);
    expect(await balance(early.id, f.mm.id)).toBe(10);
    expect(await balance(late.id, f.vn.id)).toBe(15);
    expect(await balance(late.id, f.mm.id)).toBe(5);
    const tfLines = await prisma.stockDocumentLine.findMany({ where: { documentId: tf.id } });
    expect(tfLines.every((l) => l.batchId)).toBe(true);

    const is = await createDocument(
      { type: "ISSUE", fromId: f.mm.id, reason: "Hỏng", lines: [{ variantId: f.variantId, qty: 12 }] },
      f.userId,
    );
    await postDocument(is.id, f.userId);
    expect(await balance(early.id, f.mm.id)).toBe(0);
    expect(await balance(late.id, f.mm.id)).toBe(3);

    for (const b of [early, late]) {
      const sum = await prisma.stockLedger.aggregate({ where: { batchId: b.id }, _sum: { qtyDelta: true } });
      const bal = await prisma.stockBalance.aggregate({ where: { batchId: b.id }, _sum: { qty: true } });
      expect(sum._sum.qtyDelta).toBe(bal._sum.qty);
    }
  });

  it("xuất quá tồn → lỗi, phiếu vẫn là nháp, tồn không đổi", async () => {
    const f = await makeFixture();
    const [b] = await receive(f, [{ lot: "A", expiry: "2028-01-01", qty: 5 }]);
    const is = await createDocument(
      { type: "ISSUE", fromId: f.vn.id, reason: "x", lines: [{ variantId: f.variantId, batchId: b.id, qty: 6 }] },
      f.userId,
    );
    await expect(postDocument(is.id, f.userId)).rejects.toThrow(/Tồn không đủ/);
    expect((await prisma.stockDocument.findUniqueOrThrow({ where: { id: is.id } })).status).toBe("DRAFT");
    expect(await balance(b.id, f.vn.id)).toBe(5);
  });

  it("không ghi sổ hai lần; huỷ chỉ áp dụng cho nháp", async () => {
    const f = await makeFixture();
    const doc = await createDocument(
      {
        type: "RECEIVE",
        toId: f.vn.id,
        lines: [{ variantId: f.variantId, lotNo: "A", expiryDate: "2028-01-01", unitCostVnd: 1, qty: 3 }],
      },
      f.userId,
    );
    await postDocument(doc.id, f.userId);
    await expect(postDocument(doc.id, f.userId)).rejects.toThrow(/nháp/);
    await expect(cancelDocument(doc.id, f.userId)).rejects.toThrow(/nháp/);
    const [b] = await prisma.batch.findMany({ where: { variantId: f.variantId } });
    expect(await balance(b.id, f.vn.id)).toBe(3);
  });

  it("hai phiếu xuất đồng thời không làm tồn âm (khoá dòng)", async () => {
    const f = await makeFixture();
    const [b] = await receive(f, [{ lot: "A", expiry: "2028-01-01", qty: 10 }]);
    const mk = () =>
      createDocument(
        { type: "ISSUE", fromId: f.vn.id, reason: "x", lines: [{ variantId: f.variantId, batchId: b.id, qty: 7 }] },
        f.userId,
      );
    const [d1, d2] = await Promise.all([mk(), mk()]);
    const results = await Promise.allSettled([postDocument(d1.id, f.userId), postDocument(d2.id, f.userId)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await balance(b.id, f.vn.id)).toBe(3);
  });

  it("điều chỉnh âm vượt tồn bị chặn; hàng trả phải vào vị trí Chờ kiểm tra", async () => {
    const f = await makeFixture();
    const [b] = await receive(f, [{ lot: "A", expiry: "2028-01-01", qty: 2 }]);
    const aj = await createDocument(
      { type: "ADJUST", toId: f.vn.id, reason: "Kiểm kê", lines: [{ variantId: f.variantId, batchId: b.id, qty: -3 }] },
      f.userId,
    );
    await expect(postDocument(aj.id, f.userId)).rejects.toThrow();
    await expect(
      createDocument(
        { type: "RETURN", toId: f.mm.id, reason: "Khách trả", lines: [{ variantId: f.variantId, batchId: b.id, qty: 1 }] },
        f.userId,
      ),
    ).rejects.toThrow(/Chờ kiểm tra/);
    const rt = await createDocument(
      { type: "RETURN", toId: f.qc.id, reason: "Khách trả", lines: [{ variantId: f.variantId, batchId: b.id, qty: 1 }] },
      f.userId,
    );
    await postDocument(rt.id, f.userId);
    expect(await balance(b.id, f.qc.id)).toBe(1);
  });

  it("tester là loại tồn riêng", async () => {
    const f = await makeFixture();
    const doc = await createDocument(
      {
        type: "RECEIVE",
        toId: f.vn.id,
        lines: [
          { variantId: f.variantId, lotNo: "A", expiryDate: "2028-01-01", unitCostVnd: 1, qty: 10 },
          { variantId: f.variantId, lotNo: "A", expiryDate: "2028-01-01", unitCostVnd: 1, qty: 2, stockType: "TESTER" },
        ],
      },
      f.userId,
    );
    await postDocument(doc.id, f.userId);
    const [b] = await prisma.batch.findMany({ where: { variantId: f.variantId } });
    expect(await balance(b.id, f.vn.id, "SELLABLE")).toBe(10);
    expect(await balance(b.id, f.vn.id, "TESTER")).toBe(2);
  });
});

describe("Landed cost theo chuyến hàng", () => {
  it("phân bổ chi phí vào lô và quy đổi MMK theo tỷ giá lúc nhập", async () => {
    const f = await makeFixture();
    await prisma.exchangeRate.create({
      data: { mmkPerVnd: "0.200000", createdById: f.userId, effectiveAt: new Date(Date.now() + 1000) },
    });
    const sh = await createShipment({ code: `SH-${f.tag}` });
    await receive(
      f,
      [
        { lot: "A", expiry: "2028-01-01", qty: 10, cost: 100_000 },
        { lot: "B", expiry: "2028-06-01", qty: 30, cost: 50_000 },
      ],
      sh.id,
    );
    await addShipmentCost({ shipmentId: sh.id, type: "SHIPPING", amountVnd: 300_000 });
    await addShipmentCost({ shipmentId: sh.id, type: "TAX", amountVnd: 200_000 });
    await allocateShipment(sh.id, f.userId);
    const [a, b] = await prisma.batch.findMany({ where: { variantId: f.variantId }, orderBy: { lotNo: "asc" } });
    expect(a.landedCostVnd).toBe(120_000);
    expect(b.landedCostVnd).toBe(60_000);
    expect(a.landedCostMmk).toBe(24_000);
    expect(b.landedCostMmk).toBe(12_000);
  });
});
