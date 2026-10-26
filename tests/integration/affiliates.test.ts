import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  affiliateOrders,
  assignOrderAffiliate,
  createAffiliate,
  getAffiliate,
  getAffiliateOrder,
  listAffiliates,
  recordPayout,
} from "@/server/affiliates/affiliates";
import { createOrder } from "@/server/orders/orders";
import { returnItems } from "@/server/orders/returns";
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

const DAY = 24 * 60 * 60 * 1000;

/** Đơn của CTV đã hoàn thành `daysAgo` ngày trước (qua hạn giữ 7 ngày nếu > 7). */
async function completedOrder(f: SaleFixture, affiliateCode: string, qty: number, daysAgo: number) {
  const order = await createOrder(orderInput(f, qty), { userId: null, affiliate: { source: "LINK", code: affiliateCode } });
  await transitionOrder(order.id, "confirmCod", admin(f));
  await transitionOrder(order.id, "pack", admin(f), { fromLocationId: f.mm.id });
  await transitionOrder(order.id, "ship", admin(f));
  await transitionOrder(order.id, "complete", admin(f), {}, new Date(Date.now() - daysAgo * DAY));
  return order;
}

describe("Quản lý CTV + chi trả (P10b)", () => {
  it("tạo CTV: user AFFILIATE (mặc định tiếng Myanmar) + hồ sơ; trùng mã / email → lỗi riêng", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 1 }]);
    const base = { name: "Ko Aung", phone: "09 7812 3456", commissionPercent: "12.5", password: "mat-khau-tam-12" };
    const a = await createAffiliate({ ...base, email: `ctv-${f.tag.toLowerCase()}@glow.local`, code: `n${f.tag}` }, f.userId);
    expect(a).toMatchObject({ code: `N${f.tag}`, phone: "0978123456", commissionRateBp: 1250 });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: a.userId } })).toMatchObject({ role: "AFFILIATE", locale: "my" });

    await expect(
      createAffiliate({ ...base, email: `ctv2-${f.tag.toLowerCase()}@glow.local`, code: `N${f.tag}` }, f.userId),
    ).rejects.toMatchObject({ code: "code_taken" });
    await expect(
      createAffiliate({ ...base, email: `ctv-${f.tag.toLowerCase()}@glow.local`, code: `M${f.tag}` }, f.userId),
    ).rejects.toMatchObject({ code: "email_taken" });
    await expect(
      createAffiliate({ ...base, email: `ctv3-${f.tag.toLowerCase()}@glow.local`, code: "ab" }, f.userId),
    ).rejects.toMatchObject({ code: "invalid_code" });
  });

  it("gán CTV cho đơn: chốt % hiện tại, kho không có quyền, CTV bị khoá → lỗi", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 5 }]);
    const a = await makeAffiliate(f, { rateBp: 900 });
    const locked = await makeAffiliate(f, { suffix: "L", active: false });
    const order = await createOrder(orderInput(f, 1), { userId: null });
    const staff = { userId: f.userId, role: "ORDER_STAFF" as const };

    await expect(assignOrderAffiliate(order.id, a.id, { userId: f.userId, role: "WAREHOUSE_MANAGER" })).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(assignOrderAffiliate(order.id, locked.id, staff)).rejects.toMatchObject({ code: "not_found" });
    expect(await assignOrderAffiliate(order.id, a.id, staff)).toMatchObject({ affiliateId: a.id, affiliateSource: "STAFF", commissionRateBp: 900 });
    expect(await assignOrderAffiliate(order.id, null, staff)).toMatchObject({ affiliateId: null, commissionRateBp: null });
  });

  it("chi trả: chỉ đơn qua hạn giữ; bấm 2 lần đồng thời chỉ ghi 1; không còn gì → nothing_due; đơn đã trả khoá gán CTV", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 10 }]);
    const a = await makeAffiliate(f, { rateBp: 1000 });
    const old = await completedOrder(f, a.code, 2, 10); // 20 000 → 2 000
    await completedOrder(f, a.code, 1, 2); // còn trong hạn giữ → chờ

    const detail = await getAffiliate(a.id);
    expect(detail!.summary).toMatchObject({ payableMmk: 2000, pendingMmk: 1000, paidMmk: 0 });

    const results = await Promise.allSettled([
      recordPayout(a.id, { note: "KBZPay 123" }, f.userId),
      recordPayout(a.id, { note: "KBZPay 123" }, f.userId),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "nothing_due" } });
    const payouts = await prisma.affiliatePayout.findMany({ where: { affiliateId: a.id }, include: { lines: true } });
    expect(payouts).toHaveLength(1);
    expect(payouts[0]).toMatchObject({ amountMmk: 2000, lines: [{ orderId: old.id, amountMmk: 2000 }] });

    await expect(assignOrderAffiliate(old.id, null, admin(f))).rejects.toMatchObject({ code: "order_paid" });
    expect((await getAffiliate(a.id))!.summary).toMatchObject({ payableMmk: 0, pendingMmk: 1000, paidMmk: 2000 });
  });

  it("khách trả hàng sau khi đã chi → số âm trừ vào lần chi sau", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 10 }]);
    const a = await makeAffiliate(f, { rateBp: 1000 });
    const first = await completedOrder(f, a.code, 2, 10); // 2 000
    await recordPayout(a.id, {}, f.userId);

    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: first.id } });
    await returnItems(first.id, { toLocationId: f.qc.id, lines: [{ orderItemId: item.id, qty: 1 }], reason: "Hỏng" }, admin(f));
    await completedOrder(f, a.code, 3, 9); // +3 000

    const orders = await affiliateOrders(a.id);
    expect(orders.find((o) => o.id === first.id)!.commission).toMatchObject({ commissionMmk: 1000, dueMmk: -1000 });
    const second = await recordPayout(a.id, {}, f.userId);
    expect(second.amountMmk).toBe(2000); // 3 000 − 1 000
  });

  it("tổng không dương → không cho chi", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 10 }]);
    const a = await makeAffiliate(f);
    await expect(recordPayout(a.id, {}, f.userId)).rejects.toMatchObject({ code: "nothing_due" });
  });
});

describe("Cổng CTV (P10c)", () => {
  it("CTV chỉ đọc được đơn của mình; dữ liệu không có giá vốn/lô", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 5 }]);
    const mine = await makeAffiliate(f);
    const other = await makeAffiliate(f, { suffix: "X" });
    const order = await createOrder(orderInput(f, 1), { userId: null, affiliate: { source: "LINK", code: mine.code } });
    const plain = await createOrder(orderInput(f, 1), { userId: null });

    const seen = await getAffiliateOrder(mine.id, order.id);
    expect(seen).toMatchObject({ id: order.id, recipientName: "Ma Hla", commission: { state: "pending", commissionMmk: 1000 } });
    expect(Object.keys(seen!.items[0]).sort()).toEqual(["id", "name", "qty", "returnedQty", "sku", "unitPriceMmk"]);
    expect(await getAffiliateOrder(other.id, order.id)).toBeNull();
    expect(await getAffiliateOrder(mine.id, plain.id)).toBeNull();
  });
});

describe("Tìm CTV (P10b)", () => {
  it("tìm theo mã không khớp nhầm SĐT; gõ số thì tìm theo SĐT (bỏ 0 / +95 đầu)", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 1 }]);
    const a = await makeAffiliate(f);
    const byCode = await listAffiliates({ q: a.code.toLowerCase() });
    expect(byCode.map((x) => x.id)).toEqual([a.id]);
    const byPhone = await listAffiliates({ q: "+95 9 1111 1111" });
    expect(byPhone.map((x) => x.id)).toContain(a.id);
  });
});
