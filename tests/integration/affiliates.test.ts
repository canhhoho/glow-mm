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
  setAffiliateParent,
  setOrderCommissionRates,
  teamOverview,
  updateAffiliate,
} from "@/server/affiliates/affiliates";
import {
  approveApplication,
  MAX_PENDING_PER_INVITER,
  MAX_PER_IP_PER_HOUR,
  rejectApplication,
  submitApplication,
} from "@/server/affiliates/applications";
import { createOrder } from "@/server/orders/orders";
import { returnItems } from "@/server/orders/returns";
import { transitionOrder } from "@/server/orders/transitions";
import { admin, orderInput, saleFixture, unpublishTestProducts, type SaleFixture } from "./fixtures";

afterAll(unpublishTestProducts);

/** CTV test: user role AFFILIATE + hồ sơ CTV, mã riêng theo tag của fixture. */
async function makeAffiliate(
  f: SaleFixture,
  opts: { suffix?: string; rateBp?: number; active?: boolean; userActive?: boolean; parentId?: string } = {},
) {
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
    data: {
      userId: user.id,
      code,
      phone: "0911111111",
      commissionRateBp: opts.rateBp ?? 1000,
      active: opts.active ?? true,
      parentId: opts.parentId,
    },
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

  it("sửa CTV: đổi email đăng nhập (ghi audit), trùng email → email_taken, bỏ trống email → giữ nguyên", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 1 }]);
    const a = await makeAffiliate(f, { suffix: "E" });
    const other = await makeAffiliate(f, { suffix: "F" });
    const otherEmail = (await prisma.user.findUniqueOrThrow({ where: { id: other.userId } })).email;
    const profile = { name: "Ko Aung", phone: "0911111111", code: a.code, commissionPercent: "10" };
    const newEmail = `ctv-moi-${f.tag.toLowerCase()}@tandcstore.com`;

    await updateAffiliate(a.id, { ...profile, email: ` ${newEmail.toUpperCase()} ` }, f.userId);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: a.userId } })).toMatchObject({ email: newEmail, name: "Ko Aung" });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: a.id, action: "affiliate.update" }, orderBy: { createdAt: "desc" } });
    expect(log.data).toMatchObject({ email: { to: newEmail } });

    await expect(updateAffiliate(a.id, { ...profile, email: otherEmail }, f.userId)).rejects.toMatchObject({ code: "email_taken" });
    await updateAffiliate(a.id, profile, f.userId);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a.userId } })).email).toBe(newEmail);
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

    // Đơn đã huỷ: không gán / đổi CTV, không chỉnh %.
    await assignOrderAffiliate(order.id, a.id, staff);
    await transitionOrder(order.id, "cancel", staff, { reason: "Khách huỷ" });
    await expect(assignOrderAffiliate(order.id, null, staff)).rejects.toMatchObject({ code: "order_cancelled" });
    await expect(setOrderCommissionRates(order.id, { commissionPercent: "20" }, admin(f))).rejects.toMatchObject({
      code: "order_cancelled",
    });
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

describe("Hai tầng (P11a)", () => {
  // % tầng trên mặc định 2% (setting affiliate.uplineRateBp chưa đặt trong DB test).
  it("đơn của CTV cấp dưới chốt cấp trên + 2%; cấp trên bị khoá → không chốt; đổi tuyến sau không ảnh hưởng đơn cũ", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 10 }]);
    const up = await makeAffiliate(f, { suffix: "P" });
    const lockedUp = await makeAffiliate(f, { suffix: "Q", active: false });
    const down = await makeAffiliate(f, { suffix: "D", parentId: up.id });
    const orphan = await makeAffiliate(f, { suffix: "O", parentId: lockedUp.id });

    const o1 = await createOrder(orderInput(f, 1), { userId: null, affiliate: { source: "LINK", code: down.code } });
    expect(o1).toMatchObject({ affiliateId: down.id, uplineAffiliateId: up.id, uplineRateBp: 200 });
    const o2 = await createOrder(orderInput(f, 1), { userId: null, affiliate: { source: "LINK", code: orphan.code } });
    expect(o2).toMatchObject({ affiliateId: orphan.id, uplineAffiliateId: null, uplineRateBp: null });

    await prisma.affiliate.update({ where: { id: down.id }, data: { parentId: null } });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o1.id } })).uplineAffiliateId).toBe(up.id);
    const o3 = await createOrder(orderInput(f, 1), { userId: null, affiliate: { source: "LINK", code: down.code } });
    expect(o3.uplineAffiliateId).toBeNull();

    // Nhân viên gán CTV cấp dưới → cũng chốt cấp trên.
    await prisma.affiliate.update({ where: { id: down.id }, data: { parentId: up.id } });
    const plain = await createOrder(orderInput(f, 1), { userId: null });
    expect(await assignOrderAffiliate(plain.id, down.id, admin(f))).toMatchObject({ uplineAffiliateId: up.id, uplineRateBp: 200 });
  });

  it("chi trả: cấp trên chỉ nhận dòng UPLINE, người bán chỉ SALE; chi đồng thời không trùng; trả hàng sau khi chi → trừ kỳ sau", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 10 }]);
    const up = await makeAffiliate(f, { suffix: "P" });
    const down = await makeAffiliate(f, { suffix: "D", parentId: up.id });
    const order = await completedOrder(f, down.code, 2, 10); // 20 000: bán 2 000, tầng trên 400

    expect((await getAffiliate(up.id))!.summary).toMatchObject({ payableMmk: 400, sale: { payableMmk: 0 }, upline: { payableMmk: 400 } });
    const both = await Promise.allSettled([recordPayout(up.id, {}, f.userId), recordPayout(up.id, {}, f.userId)]);
    expect(both.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const upLines = await prisma.affiliatePayoutLine.findMany({ where: { payout: { affiliateId: up.id } } });
    expect(upLines).toMatchObject([{ orderId: order.id, kind: "UPLINE", amountMmk: 400 }]);

    const sale = await recordPayout(down.id, {}, f.userId);
    expect(sale.amountMmk).toBe(2000);
    expect(await prisma.affiliatePayoutLine.findMany({ where: { payoutId: sale.id } })).toMatchObject([{ kind: "SALE", amountMmk: 2000 }]);
    await expect(assignOrderAffiliate(order.id, null, admin(f))).rejects.toMatchObject({ code: "order_paid" });

    // Khách trả 1 món sau khi đã chi cả hai → mỗi bên âm phần của mình.
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    await returnItems(order.id, { toLocationId: f.qc.id, lines: [{ orderItemId: item.id, qty: 1 }], reason: "Hỏng" }, admin(f));
    await completedOrder(f, down.code, 3, 9); // tầng trên +600
    expect((await getAffiliate(up.id))!.summary.payableMmk).toBe(400); // 600 − 200
    expect((await recordPayout(up.id, {}, f.userId)).amountMmk).toBe(400);
  });
});

describe("Đăng ký qua link mời + duyệt (P11b)", () => {
  const form = (invite: string, tag: string, extra: Record<string, string> = {}) => ({
    invite,
    name: `Ko Moi ${tag}`,
    phone: `09 ${String(parseInt(tag.slice(0, 6), 16) % 100_000_000).padStart(8, "0")}`,
    email: `moi-${tag.toLowerCase()}@glow.local`,
    password: "mat-khau-moi-12",
    confirmPassword: "mat-khau-moi-12",
    ...extra,
  });
  const ip = (f: SaleFixture, n = 0) => `10.${f.tag}.${n}`;

  it("gửi đơn → duyệt: tạo user AFFILIATE dưới người mời, đăng nhập bằng mật khẩu đã đặt, xoá hash; duyệt lần 2 bị chặn", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 1 }]);
    const inviter = await makeAffiliate(f, { suffix: "I" });
    const app = await submitApplication(form(inviter.code.toLowerCase(), f.tag), { ip: ip(f) });
    expect(app).toMatchObject({ inviterId: inviter.id, status: "PENDING", phone: expect.stringMatching(/^09/) });
    expect(app!.passwordHash).toBeTruthy();

    const a = await approveApplication(app!.id, { code: `J${f.tag}`, commissionPercent: "8" }, f.userId);
    expect(a).toMatchObject({ code: `J${f.tag}`, parentId: inviter.id, commissionRateBp: 800 });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: a!.userId }, include: { accounts: true } });
    expect(user).toMatchObject({ role: "AFFILIATE", email: `moi-${f.tag.toLowerCase()}@glow.local` });
    expect(user.accounts[0].password).toBe(app!.passwordHash);
    expect(await prisma.affiliateApplication.findUniqueOrThrow({ where: { id: app!.id } })).toMatchObject({
      status: "APPROVED",
      passwordHash: null,
      affiliateId: a!.id,
    });
    await expect(approveApplication(app!.id, { code: `K${f.tag}`, commissionPercent: "8" }, f.userId)).rejects.toMatchObject({
      code: "not_pending",
    });
  });

  it("từ chối xoá hash; link sai / email đã có / đơn trùng / bot (honeypot) bị chặn hoặc bỏ qua", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 1 }]);
    const inviter = await makeAffiliate(f, { suffix: "I" });
    const locked = await makeAffiliate(f, { suffix: "L", active: false });

    await expect(submitApplication(form(locked.code, f.tag), { ip: ip(f) })).rejects.toMatchObject({ code: "invalid_invite" });
    await expect(submitApplication(form(inviter.code, f.tag, { email: "it-runner@glow.local" }), { ip: ip(f) })).rejects.toMatchObject({
      code: "email_taken",
    });
    expect(await submitApplication(form(inviter.code, f.tag), { ip: ip(f), honeypot: "http://spam" })).toBeNull();

    const app = await submitApplication(form(inviter.code, f.tag), { ip: ip(f) });
    await expect(submitApplication(form(inviter.code, f.tag), { ip: ip(f, 1) })).rejects.toMatchObject({ code: "duplicate" });
    await rejectApplication(app!.id, "Không đủ điều kiện", f.userId);
    expect(await prisma.affiliateApplication.findUniqueOrThrow({ where: { id: app!.id } })).toMatchObject({
      status: "REJECTED",
      passwordHash: null,
      note: "Không đủ điều kiện",
    });
    await expect(rejectApplication(app!.id, "", f.userId)).rejects.toMatchObject({ code: "not_pending" });
  });

  it("chống spam: tối đa đơn chờ mỗi người mời và số đơn mỗi giờ mỗi IP", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 1 }]);
    const inviter = await makeAffiliate(f, { suffix: "I" });
    await prisma.affiliateApplication.createMany({
      data: Array.from({ length: MAX_PENDING_PER_INVITER }, (_, i) => ({
        inviterId: inviter.id,
        name: `Spam ${i}`,
        phone: `09${f.tag.slice(0, 4)}${String(i).padStart(4, "0")}`.replace(/[A-F]/g, "1"),
        email: `spam-${i}-${f.tag.toLowerCase()}@glow.local`,
      })),
    });
    await expect(submitApplication(form(inviter.code, f.tag), { ip: ip(f, 2) })).rejects.toMatchObject({ code: "too_many" });

    const other = await makeAffiliate(f, { suffix: "O" });
    const now = new Date();
    for (let i = 0; i < MAX_PER_IP_PER_HOUR; i++) {
      await submitApplication(form(other.code, f.tag, { email: `ip-${i}-${f.tag.toLowerCase()}@glow.local`, phone: `09 7${String(parseInt(f.tag, 16) % 1_000_000).padStart(6, "0")}${i}` }), {
        ip: ip(f, 3),
        now,
      });
    }
    await expect(
      submitApplication(form(other.code, f.tag, { email: `ip-9-${f.tag.toLowerCase()}@glow.local`, phone: `09 7${String(parseInt(f.tag, 16) % 1_000_000).padStart(6, "0")}9` }), { ip: ip(f, 3), now }),
    ).rejects.toMatchObject({ code: "too_many" });
  });

  it("đổi cấp trên: chặn vòng (chính mình / tuyến dưới), cho phép bỏ cấp trên", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 1 }]);
    const a = await makeAffiliate(f, { suffix: "A" });
    const b = await makeAffiliate(f, { suffix: "B", parentId: a.id });
    const c = await makeAffiliate(f, { suffix: "C", parentId: b.id });
    await expect(setAffiliateParent(a.id, a.id, f.userId)).rejects.toMatchObject({ code: "cycle" });
    await expect(setAffiliateParent(a.id, c.id, f.userId)).rejects.toMatchObject({ code: "cycle" });
    await setAffiliateParent(c.id, a.id, f.userId);
    expect((await prisma.affiliate.findUniqueOrThrow({ where: { id: c.id } })).parentId).toBe(a.id);
    await setAffiliateParent(c.id, null, f.userId);
    expect((await prisma.affiliate.findUniqueOrThrow({ where: { id: c.id } })).parentId).toBeNull();
  });
});

describe("Tuyến dưới (P11c)", () => {
  it("tổng hợp theo từng CTV cấp dưới + người đã chuyển tuyến; không trả thông tin khách", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 10 }]);
    const up = await makeAffiliate(f, { suffix: "P" });
    const d1 = await makeAffiliate(f, { suffix: "D1", parentId: up.id });
    const d2 = await makeAffiliate(f, { suffix: "D2", parentId: up.id });
    await completedOrder(f, d1.code, 2, 10); // tầng trên 400 đến hạn
    await createOrder(orderInput(f, 1), { userId: null, affiliate: { source: "LINK", code: d2.code } }); // tầng trên 200 chờ
    await setAffiliateParent(d2.id, null, f.userId); // d2 chuyển ra → đơn cũ vẫn tính cho up (former)

    const team = await teamOverview(up.id);
    expect(team.uplineRateBp).toBe(200);
    expect(team.children.map((c) => c.code)).toEqual([d1.code]);
    expect(team.children[0]).toMatchObject({ monthOrders: 1, commission: { payableMmk: 400, pendingMmk: 0 } });
    expect(team.former).toMatchObject({ pendingMmk: 200 });
    expect(team.total).toMatchObject({ payableMmk: 400, pendingMmk: 200 });
    expect(JSON.stringify(team)).not.toMatch(/Ma Hla|0978123456|Bo Aung Kyaw/);
  });
});

describe("Admin chỉnh % (P13)", () => {
  it("% tầng trên riêng của cấp trên được chốt vào đơn; để trống → % chung; đổi sau không ảnh hưởng đơn cũ", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 10 }]);
    const up = await makeAffiliate(f, { suffix: "P" });
    const down = await makeAffiliate(f, { suffix: "D", parentId: up.id });
    await prisma.affiliate.update({ where: { id: up.id }, data: { uplineRateBp: 300 } });
    const o1 = await createOrder(orderInput(f, 1), { userId: null, affiliate: { source: "LINK", code: down.code } });
    expect(o1.uplineRateBp).toBe(300);

    // Admin để trống ô % tầng trên qua form hồ sơ → quay về % chung.
    await updateAffiliate(
      up.id,
      { name: "Up", phone: "0911111111", code: up.code, commissionPercent: "10", uplinePercent: "" },
      f.userId,
    );
    expect((await prisma.affiliate.findUniqueOrThrow({ where: { id: up.id } })).uplineRateBp).toBeNull();
    const o2 = await createOrder(orderInput(f, 1), { userId: null, affiliate: { source: "LINK", code: down.code } });
    expect(o2.uplineRateBp).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o1.id } })).uplineRateBp).toBe(300);

    await updateAffiliate(up.id, { name: "Up", phone: "0911111111", code: up.code, commissionPercent: "10", uplinePercent: "4.5" }, f.userId);
    expect((await prisma.affiliate.findUniqueOrThrow({ where: { id: up.id } })).uplineRateBp).toBe(450);
  });

  it("chỉnh % trên đơn chưa chi trả → hoa hồng tính lại; đơn đã chi trả bị khoá; NV đơn hàng không có quyền", async () => {
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 10 }]);
    const up = await makeAffiliate(f, { suffix: "P" });
    const down = await makeAffiliate(f, { suffix: "D", parentId: up.id });
    const solo = await makeAffiliate(f, { suffix: "S" });
    const order = await completedOrder(f, down.code, 2, 10); // 20 000

    await expect(
      setOrderCommissionRates(order.id, { commissionPercent: "15" }, { userId: f.userId, role: "ORDER_STAFF" }),
    ).rejects.toMatchObject({ code: "forbidden" });

    await setOrderCommissionRates(order.id, { commissionPercent: "15", uplinePercent: "5" }, admin(f));
    const mine = (await affiliateOrders(down.id)).find((o) => o.id === order.id)!;
    expect(mine.commission.commissionMmk).toBe(3000);
    expect(mine.uplineCommission!.commissionMmk).toBe(1000);

    // Đơn không có cấp trên: % tầng trên bị bỏ qua.
    const plain = await createOrder(orderInput(f, 1), { userId: null, affiliate: { source: "LINK", code: solo.code } });
    expect(await setOrderCommissionRates(plain.id, { commissionPercent: "8", uplinePercent: "9" }, admin(f))).toMatchObject({
      commissionRateBp: 800,
      uplineRateBp: null,
    });

    await recordPayout(down.id, {}, f.userId);
    await expect(setOrderCommissionRates(order.id, { commissionPercent: "20" }, admin(f))).rejects.toMatchObject({ code: "order_paid" });
  });
});
