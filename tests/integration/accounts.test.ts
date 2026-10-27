import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  AccountError,
  accountOrders,
  createAddress,
  defaultAddress,
  deleteAddress,
  listAddresses,
  MAX_ADDRESSES,
  setDefaultAddress,
  updateAddress,
  updateProfile,
} from "@/server/accounts/accounts";
import { claimOrders } from "@/server/accounts/claims";
import { createOrder, findOrderForAccount } from "@/server/orders/orders";
import { orderInput, saleFixture, unpublishTestProducts } from "./fixtures";

afterAll(unpublishTestProducts);

async function customer() {
  const tag = randomBytes(4).toString("hex");
  return prisma.user.create({ data: { id: `it-cus-${tag}`, email: `it-cus-${tag}@glow.local`, name: "IT", role: "CUSTOMER" } });
}

async function zoneId() {
  const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 5 }]);
  return { f, zoneId: f.townshipId };
}

const addr = (townshipId: string, extra: Record<string, unknown> = {}) => ({
  recipientName: "Ma Hla",
  phone: "+95 9 7812 3456",
  townshipId,
  line: "No. 12, Bo Aung Kyaw St",
  ...extra,
});

describe("Sổ địa chỉ khách (P14b)", () => {
  it("địa chỉ đầu tự mặc định; đặt mặc định chỉ một; xoá mặc định → địa chỉ mới nhất lên mặc định", async () => {
    const u = await customer();
    const { zoneId: z } = await zoneId();
    const a = await createAddress(u.id, addr(z, { phone2: "09 4000 2222" }));
    expect(a).toMatchObject({ isDefault: true, phone: "0978123456", phone2: "0940002222", townshipId: "tw-YGN-WYG-KMY" });
    const b = await createAddress(u.id, addr(z, { recipientName: "Ko Ko", isDefault: "on" }));
    const c = await createAddress(u.id, addr(z, { recipientName: "Ma Ma" }));
    expect((await listAddresses(u.id)).filter((x) => x.isDefault).map((x) => x.id)).toEqual([b.id]);

    await setDefaultAddress(u.id, a.id);
    expect((await defaultAddress(u.id))?.id).toBe(a.id);
    await deleteAddress(u.id, a.id);
    expect((await defaultAddress(u.id))?.id).toBe(c.id);
    expect(await prisma.accountAddress.count({ where: { userId: u.id, isDefault: true } })).toBe(1);
  });

  it("không đụng được địa chỉ của tài khoản khác; SĐT / khu vực sai bị từ chối; tối đa 10", async () => {
    const [u, other] = [await customer(), await customer()];
    const { zoneId: z } = await zoneId();
    const mine = await createAddress(u.id, addr(z));
    for (const op of [
      () => updateAddress(other.id, mine.id, addr(z)),
      () => setDefaultAddress(other.id, mine.id),
      () => deleteAddress(other.id, mine.id),
    ]) {
      await expect(op()).rejects.toMatchObject({ code: "not_found" });
    }
    await expect(createAddress(u.id, addr(z, { phone: "12345" }))).rejects.toMatchObject({ code: "invalid_phone" });
    await expect(createAddress(u.id, addr("khong-co"))).rejects.toMatchObject({ code: "invalid_zone" });
    await expect(createAddress(u.id, addr(z, { phone2: "12" }))).rejects.toMatchObject({ code: "invalid_phone" });

    for (let i = 1; i < MAX_ADDRESSES; i++) await createAddress(u.id, addr(z));
    await expect(createAddress(u.id, addr(z))).rejects.toBeInstanceOf(AccountError);
    expect(await prisma.accountAddress.count({ where: { userId: u.id } })).toBe(MAX_ADDRESSES);
  });

  it("đổi tên (cắt khoảng trắng)", async () => {
    const u = await customer();
    expect((await updateProfile(u.id, { name: "  Ma Thida  " })).name).toBe("Ma Thida");
  });
});

describe("Đơn của tài khoản (P14b)", () => {
  it("chỉ thấy đơn thuộc tài khoản mình", async () => {
    const { f } = await zoneId();
    const order = await createOrder(orderInput(f, 1), { userId: null });
    const [u, other] = [await customer(), await customer()];
    expect(await findOrderForAccount(order.code, u.id)).toBeNull();
    await claimOrders(u.id, [{ c: order.code, p: "0978123456" }]);
    expect((await findOrderForAccount(order.code, u.id))?.id).toBe(order.id);
    expect(await findOrderForAccount(order.code, other.id)).toBeNull();
    expect((await accountOrders(u.id)).map((o) => o.code)).toEqual([order.code]);
    expect(await accountOrders(other.id)).toEqual([]);
  });

  it("đơn đặt trên web khi đăng nhập lưu accountId (P14c)", async () => {
    const { f } = await zoneId();
    const u = await customer();
    const order = await createOrder(orderInput(f, 1), { userId: null, accountId: u.id });
    expect(order).toMatchObject({ accountId: u.id, createdById: null, channel: "WEB" });
    expect((await accountOrders(u.id)).map((o) => o.id)).toEqual([order.id]);
  });
});
