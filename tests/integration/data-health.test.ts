import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createDocument } from "@/server/inventory/documents";
import { createOrder } from "@/server/orders/orders";
import { transitionOrder } from "@/server/orders/transitions";
import { baseline, dataHealth, type CheckKey } from "@/server/reports/data-health";
import { admin, makeFixture, orderInput, saleFixture, unpublishTestProducts } from "./fixtures";

afterAll(unpublishTestProducts);

// DB test dùng chung, tích luỹ dữ liệu → so số đếm trước/sau (integration chạy tuần tự) thay vì số tuyệt đối.
async function counts() {
  const report = await dataHealth();
  return new Map(report.groups.flatMap((g) => g.checks).map((c) => [c.key, c.count] as [CheckKey, number]));
}
const tableSizes = async () =>
  Promise.all([prisma.stockLedger.count(), prisma.stockBalance.count(), prisma.batch.count(), prisma.variant.count(), prisma.order.count()]);

describe("Sức khoẻ dữ liệu (D0)", () => {
  it("phát hiện giá 0, thiếu khối lượng theo kho, lô chỉ từ phiếu nháp, tồn bán thiếu giá vốn — và không ghi gì", async () => {
    const before = await counts();

    // SP đang hiển thị giá 0 + thiếu khối lượng ở kho VN_IMPORT; lô đã ghi sổ không có giá vốn (chưa phân bổ, chưa tạm).
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 3 }], { cost: false });
    await prisma.variant.update({ where: { id: f.variantId }, data: { priceMmk: 0 } });
    // SP khác ở kho LOCAL_MMK thiếu khối lượng (chỉ cảnh báo) + chỉ có lô từ phiếu nháp.
    const g = await makeFixture();
    await prisma.product.update({ where: { id: g.productId }, data: { stockLocationId: g.chi.id } });
    await createDocument(
      { type: "RECEIVE", toId: g.chi.id, lines: [{ variantId: g.variantId, lotNo: "D", expiryDate: "2028-12-31", unitCostMmk: 5_000, qty: 2 }] },
      g.userId,
    );

    const sizes = await tableSizes();
    const after = await counts();
    expect(await tableSizes()).toEqual(sizes); // chỉ đọc

    const delta = (k: CheckKey) => (after.get(k) ?? 0) - (before.get(k) ?? 0);
    expect(delta("publishedZeroPrice")).toBe(1);
    expect(delta("missingWeight")).toBe(1); // f: kho mm (VN_IMPORT)
    expect(delta("missingWeightLocal")).toBe(1); // g: kho chi (LOCAL_MMK)
    expect(delta("stockMissingCost")).toBe(1);
    expect(delta("draftOnlyCost")).toBe(1);

    // Giá 0 sửa xong → hết lỗi; lô có giá vốn tạm → không còn thiếu vốn.
    await prisma.variant.update({ where: { id: f.variantId }, data: { priceMmk: 10_000, weightGrams: 50 } });
    await prisma.batch.updateMany({ where: { variantId: f.variantId }, data: { estimatedCostMmk: 17_000 } });
    const fixed = await counts();
    expect((fixed.get("publishedZeroPrice") ?? 0) - (before.get("publishedZeroPrice") ?? 0)).toBe(0);
    expect((fixed.get("missingWeight") ?? 0) - (before.get("missingWeight") ?? 0)).toBe(0);
    expect((fixed.get("stockMissingCost") ?? 0) - (before.get("stockMissingCost") ?? 0)).toBe(0);
  });

  it("mốc vận hành: thời gian đặt → xác nhận → bàn giao → hoàn tất lấy từ lịch sử trạng thái; COD chưa về theo tuổi nợ", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 5 }]);
    const t0 = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const before = await baseline();
    const order = await createOrder(orderInput(f, 1), { userId: null, now: t0 });
    await transitionOrder(order.id, "confirmCod", admin(f));
    await transitionOrder(order.id, "ship", admin(f), { fromLocationId: f.mm.id, carrier: "VTP", trackingNo: `IT-${f.tag}` });
    await transitionOrder(order.id, "complete", admin(f));
    const after = await baseline();

    expect(after.flow.createdToConfirmed.n).toBe(before.flow.createdToConfirmed.n + 1);
    expect(after.flow.createdToShipped.n).toBe(before.flow.createdToShipped.n + 1);
    expect(after.flow.shippedToCompleted.n).toBe(before.flow.shippedToCompleted.n + 1);
    expect(after.flow.createdToShipped.p50).not.toBeNull();
    // Hoàn tất COD = hãng đã thu, chưa đối soát tiền về → vào nhóm 0-7 ngày.
    expect(after.cod.outstandingOrders).toBe(before.cod.outstandingOrders + 1);
    expect(after.cod.buckets[0].orders).toBe(before.cod.buckets[0].orders + 1);
    expect(after.cod.buckets[0].mmk - before.cod.buckets[0].mmk).toBe(order.totalMmk);
  });
});
