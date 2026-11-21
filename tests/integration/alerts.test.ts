import { afterAll, describe, expect, it, vi } from "vitest";
// Kiểm quy tắc hạn dùng → chạy với cờ hạn dùng BẬT (production đang tắt, 17/11/2026; hành vi tắt: expiry-off.test.ts).
vi.mock("@/lib/features", async (orig) => (await import("../support/expiry-on")).expiryOn(orig));
import { prisma } from "@/lib/db";
import { reorderSuggestion } from "@/server/alerts/compute";
import { computeAlerts, runComputeAlerts } from "@/server/alerts/queries";
import { createDocument, postDocument } from "@/server/inventory/documents";
import { createOrder } from "@/server/orders/orders";
import { returnItems } from "@/server/orders/returns";
import { transitionOrder } from "@/server/orders/transitions";
import { admin, isoDay, orderInput, saleFixture, unpublishTestProducts } from "./fixtures";

afterAll(unpublishTestProducts);

describe("Cảnh báo kho + gợi ý đặt hàng", () => {
  it("tồn thấp, lô khoá/cận date, tốc độ bán trừ hàng trả, hàng VN + đang về", async () => {
    const f = await saleFixture([
      { lot: "NEAR", expiryInDays: 30, qty: 2 },
      { lot: "WARN", expiryInDays: 120, qty: 3 },
      { lot: "FAR", expiryInDays: 400, qty: 20 },
    ]);
    // 20/11/2026: ngưỡng chung ở Cài đặt (không còn theo cột của phân loại) — đặt tạm, khôi phục ở cuối test.
    const keys = { "reorder.lowStockAt": 20, "reorder.safetyStock": 30, "reorder.leadTimeDays": 21 } as const;
    const saved = await prisma.setting.findMany({ where: { key: { in: Object.keys(keys) } } });
    for (const [key, value] of Object.entries(keys)) await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
    try {
      for (const [loc, lot, qty] of [
        [f.vn.id, "VN1", 4],
        [f.transit.id, "TR1", 3],
      ] as const) {
        const doc = await createDocument(
          {
            type: "RECEIVE",
            toId: loc,
            lines: [{ variantId: f.variantId, lotNo: lot, expiryDate: isoDay(500), unitCostVnd: 100_000, qty }],
          },
          f.userId,
        );
        await postDocument(doc.id, f.userId);
      }

      // Bán 6 (FEFO bỏ lô NEAR bị khoá: WARN 3 + FAR 3), khách trả lại 1 → đã bán 5.
      const order = await createOrder(orderInput(f, 6), { userId: null });
      await transitionOrder(order.id, "confirmCod", admin(f));
      await transitionOrder(order.id, "ship", admin(f), { fromLocationId: f.mm.id, carrier: "Test" });
      await transitionOrder(order.id, "complete", admin(f));
      const [item] = await prisma.orderItem.findMany({ where: { orderId: order.id } });
      await returnItems(order.id, { toLocationId: f.qc.id, lines: [{ orderItemId: item.id, qty: 1 }], reason: "x" }, admin(f));

      const alerts = await computeAlerts();
      const low = alerts.lowStock.find((v) => v.variantId === f.variantId);
      // 7 cái nhập vào VN-STOCK / IN-TRANSIT (vị trí cũ) = "tồn ở vị trí khác": hiện để xem, KHÔNG tính vào gợi ý.
      expect(low).toMatchObject({ available: 17, otherQty: 7, soldUnits: 5 });

      const reorder = alerts.reorder.find((r) => r.variantId === f.variantId);
      const expected = reorderSuggestion(low!, {
        salesWindowDays: alerts.settings.salesWindowDays,
        coverDays: alerts.settings.coverDays,
      });
      expect(reorder).toMatchObject({ suggestQty: expected.suggestQty });
      expect(expected.suggestQty).toBeGreaterThan(0); // an toàn 30 > 17 khả dụng
      expect(reorderSuggestion({ ...low!, otherQty: 0 }, { salesWindowDays: alerts.settings.salesWindowDays, coverDays: alerts.settings.coverDays }).suggestQty).toBe(expected.suggestQty);

      const mine = alerts.expiry.filter((e) => e.sku === `IT-${f.tag}`);
      expect(mine.find((e) => e.lotNo === "NEAR")).toMatchObject({ level: "blocked", qty: 2, location: f.mm.code });
      // Hàng trả của lô WARN nằm ở Chờ kiểm tra, vẫn bị cảnh báo cận date.
      expect(mine.find((e) => e.lotNo === "WARN")).toMatchObject({ level: "near", qty: 1, location: f.qc.code });
      expect(mine.some((e) => e.lotNo === "FAR")).toBe(false);
      expect(low).toMatchObject({ lowStockAt: 20, safetyStock: 30, leadTimeDays: 21 }); // lấy từ Cài đặt
    } finally {
      await prisma.setting.deleteMany({ where: { key: { in: Object.keys(keys) } } });
      for (const row of saved) await prisma.setting.create({ data: { key: row.key, value: row.value ?? 0 } });
    }
  });

  it("cron ghi tóm tắt vào nhật ký", async () => {
    const counts = await runComputeAlerts();
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "alerts.compute" }, orderBy: { createdAt: "desc" } });
    expect(log.data).toEqual(counts);
  });
});
