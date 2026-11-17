import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { FEATURES } from "@/lib/features";
import { createDocument, postDocument, salesBlockDays } from "@/server/inventory/documents";
import { avail, makeFixture, saleFixture } from "./fixtures";

// Hành vi PRODUCTION hiện tại (17/11/2026): cờ hạn dùng TẮT hoàn toàn (`FEATURES.expiry = false`) — không chặn bán theo
// hạn (kể cả lô đã hết hạn), nhập kho không bắt buộc hạn. Quy tắc khi bật cờ được kiểm ở các file có `support/expiry-on`.

describe("Cờ hạn dùng TẮT", () => {
  it("cờ đang tắt; ngưỡng chặn bán = 0", async () => {
    expect(FEATURES.expiry).toBe(false);
    expect(await salesBlockDays()).toBe(0);
  });

  it("lô đã hết hạn và lô dưới ngưỡng 90 ngày vẫn tính vào khả dụng bán", async () => {
    const f = await saleFixture([
      { lot: "EXP", expiryInDays: -10, qty: 2 },
      { lot: "NEAR", expiryInDays: 30, qty: 3 },
      { lot: "OK", expiryInDays: 400, qty: 4 },
    ]);
    expect(await avail(f.variantId)).toBe(9);
  });

  it("nhập kho không cần hạn: không ngày → lô 'không hạn'; có ngày → lô có ngày; trạng thái gửi lên bị bỏ qua", async () => {
    const f = await makeFixture();
    const doc = await createDocument(
      {
        type: "RECEIVE",
        toId: f.mm.id,
        lines: [
          { variantId: f.variantId, lotNo: "NODATE", unitCostVnd: 100_000, qty: 1, expiryStatus: "UNKNOWN" },
          { variantId: f.variantId, lotNo: "DATED", unitCostVnd: 100_000, qty: 1, expiryDate: "2029-12-31" },
        ],
      },
      f.userId,
    );
    await postDocument(doc.id, f.userId);
    const lots = await prisma.batch.findMany({ where: { variantId: f.variantId }, orderBy: { lotNo: "asc" }, select: { lotNo: true, expiryStatus: true } });
    expect(lots).toEqual([
      { lotNo: "DATED", expiryStatus: "DATED" },
      { lotNo: "NODATE", expiryStatus: "NONE" },
    ]);
  });

  it("nhập thêm vào lô đã có với hạn khác không bị chặn (hạn của lô giữ nguyên)", async () => {
    const f = await makeFixture();
    const line = (expiryDate?: string) => ({ variantId: f.variantId, lotNo: "L1", unitCostVnd: 100_000, qty: 1, ...(expiryDate ? { expiryDate } : {}) });
    await postDocument((await createDocument({ type: "RECEIVE", toId: f.mm.id, lines: [line("2029-12-31")] }, f.userId)).id, f.userId);
    await postDocument((await createDocument({ type: "RECEIVE", toId: f.mm.id, lines: [line("2030-06-30")] }, f.userId)).id, f.userId);
    const lot = await prisma.batch.findFirstOrThrow({ where: { variantId: f.variantId, lotNo: "L1" } });
    expect(lot.expiryDate?.toISOString().slice(0, 10)).toBe("2029-12-31");
    expect(await avail(f.variantId)).toBe(2);
  });
});
