import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createOrder } from "@/server/orders/orders";
import { transitionOrder } from "@/server/orders/transitions";
import { admin, orderInput, saleFixture, unpublishTestProducts, type SaleFixture } from "./fixtures";

afterAll(unpublishTestProducts);

/** CTV test: user role AFFILIATE + hồ sơ CTV, mã riêng theo tag của fixture. */
async function makeAffiliate(f: SaleFixture, opts: { suffix?: string; rateBp?: number; active?: boolean; userActive?: boolean } = {}) {
  const code = `C${f.tag}${opts.suffix ?? ""}`;
  const user = await prisma.user.create({
    data: {
      id: `it-ctv-${code}`,
      email: `it-ctv-${code.toLowerCase()}@glow.local`,
      name: `CTV ${code}`,
      role: "AFFILIATE",
      active: opts.userActive ?? true,
    },
  });
  return prisma.affiliate.create({
    data: { userId: user.id, code, phone: "0911111111", commissionRateBp: opts.rateBp ?? 1000, active: opts.active ?? true },
  });
}

describe("Gắn CTV khi tạo đơn (P10)", () => {
  it("link giới thiệu hợp lệ → đơn thuộc CTV, chốt % lúc đặt (đổi % sau không ảnh hưởng)", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 5 }]);
    const a = await makeAffiliate(f, { rateBp: 1200 });
    const order = await createOrder(orderInput(f, 1), { userId: null, affiliate: { source: "LINK", code: a.code } });
    expect(order).toMatchObject({ affiliateId: a.id, affiliateSource: "LINK", commissionRateBp: 1200, channel: "WEB" });

    await prisma.affiliate.update({ where: { id: a.id }, data: { commissionRateBp: 500 } });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).commissionRateBp).toBe(1200);
  });

  it("mã không tồn tại / CTV bị khoá / tài khoản bị khoá → đơn vẫn đặt được, không gắn CTV", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 5 }]);
    const locked = await makeAffiliate(f, { suffix: "L", active: false });
    const userLocked = await makeAffiliate(f, { suffix: "U", userActive: false });
    for (const code of ["ZZZZ9999", locked.code, userLocked.code]) {
      const order = await createOrder(orderInput(f, 1), { userId: null, affiliate: { source: "LINK", code } });
      expect(order).toMatchObject({ affiliateId: null, affiliateSource: null, commissionRateBp: null });
    }
  });

  it("CTV tự lên đơn: ghi người tạo + nguồn AFFILIATE, giữ kênh đã chọn", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 5 }]);
    const a = await makeAffiliate(f);
    const order = await createOrder(
      { ...orderInput(f, 2), channel: "FACEBOOK" },
      { userId: a.userId, affiliate: { source: "AFFILIATE", id: a.id } },
    );
    expect(order).toMatchObject({ affiliateId: a.id, affiliateSource: "AFFILIATE", createdById: a.userId, channel: "FACEBOOK" });
  });

  it("nhân viên gán CTV đã khoá → invalid_affiliate, không tạo đơn", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 5 }]);
    const a = await makeAffiliate(f, { active: false });
    await expect(
      createOrder(orderInput(f, 1), { userId: f.userId, affiliate: { source: "STAFF", id: a.id } }),
    ).rejects.toMatchObject({ code: "invalid_affiliate" });
    expect(await prisma.order.count({ where: { items: { some: { variantId: f.variantId } } } })).toBe(0);
  });

  it("hoàn thành đơn → ghi completedAt (mốc tính hạn giữ hoa hồng)", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 5 }]);
    const a = await makeAffiliate(f);
    const order = await createOrder(orderInput(f, 1), { userId: null, affiliate: { source: "LINK", code: a.code } });
    const at = new Date("2026-10-01T03:00:00Z");
    await transitionOrder(order.id, "confirmCod", admin(f));
    await transitionOrder(order.id, "pack", admin(f), { fromLocationId: f.mm.id });
    await transitionOrder(order.id, "ship", admin(f));
    const done = await transitionOrder(order.id, "complete", admin(f), {}, at);
    expect(done).toMatchObject({ status: "COMPLETED", completedAt: at });
  });
});
