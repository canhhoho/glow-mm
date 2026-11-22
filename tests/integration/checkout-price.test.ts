import { randomBytes } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockCookies = new Map<string, string>();
let mockCustomer: Record<string, unknown> | null = null;
let redirectedTo: unknown = null;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (mockCookies.has(name) ? { value: mockCookies.get(name)! } : undefined),
    set: (name: string, value: string) => mockCookies.set(name, value),
    delete: (name: string) => mockCookies.delete(name),
  }),
  headers: async () => new Headers(),
}));

vi.mock("@/server/auth/customer-session", () => ({
  requireCustomer: async () => {
    if (!mockCustomer) throw new Error("not authenticated");
    return mockCustomer;
  },
  getCustomerUser: async () => mockCustomer,
}));

vi.mock("@/i18n/navigation", () => ({
  redirect: (dest: unknown) => {
    redirectedTo = dest;
    throw new Error("NEXT_REDIRECT");
  },
  Link: () => null,
}));

// Vitest không chạy trong môi trường React Server → getTranslations thật báo "not supported in Client Components".
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string, values?: Record<string, unknown>) => (values ? `${key} ${Object.values(values).join(" ")}` : key),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    redirectedTo = url;
    throw new Error("NEXT_REDIRECT");
  },
}));

import { prisma } from "@/lib/db";
import { placeOrderAction } from "@/server/cart/actions";
import { saleFixture, unpublishTestProducts } from "./fixtures";

afterAll(unpublishTestProducts);

function makeFormData(data: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) fd.append(k, v);
  return fd;
}

describe("Checkout A1 — Giá đổi yêu cầu khách xác nhận lại", () => {
  beforeEach(() => {
    mockCookies.clear();
    mockCustomer = null;
    redirectedTo = null;
  });

  it("giá đổi giữa lúc xem và đặt → không tạo đơn, trả priceChanged: true và newTotal", async () => {
    const f = await saleFixture([{ lot: "LOT1", expiryInDays: 400, qty: 10 }]);
    // Variant f.variantId mặc định priceMmk = 10_000 trong makeFixture
    const tag = randomBytes(4).toString("hex");
    const user = await prisma.user.create({
      data: {
        id: `it-price-${tag}`,
        email: `it-price-${tag}@glow.local`,
        name: "Daw Mya",
        role: "CUSTOMER",
      },
    });
    mockCustomer = {
      id: user.id,
      name: user.name,
      email: user.email,
      locale: "en",
      phone: "0978123456",
      contact: user.email,
      affiliate: null,
    };

    // Giỏ có 2 cái variantId (tổng hiện hành 2 × 10.000 = 20.000 MMK)
    mockCookies.set("cart", `${f.variantId}:2`); // định dạng serializeCart

    // Khách gửi với expectedTotalMmk = 15.000 (giá cũ khách từng thấy)
    const fd1 = makeFormData({
      locale: "en",
      name: "Daw Mya",
      phone: "0978123456",
      townshipId: f.townshipId,
      addressLine: "No. 12, Pyay Road",
      paymentMethod: "COD",
      expectedTotalMmk: "15000",
      idempotencyKey: `test-idem-${tag}-1`,
    });

    const res1 = await placeOrderAction(undefined, fd1);
    expect(res1).toMatchObject({
      priceChanged: true,
      newTotal: 20_000,
    });
    expect(res1?.error).toContain("20,000");

    // Chưa có đơn nào được tạo trong DB
    const orderCount1 = await prisma.order.count({ where: { accountId: user.id } });
    expect(orderCount1).toBe(0);

    // Bây giờ giá trong DB tăng lên 15.000 MMK / cái (tổng mới = 30.000 MMK)
    await prisma.variant.update({
      where: { id: f.variantId },
      data: { priceMmk: 15_000 },
    });

    // Khách gửi lại với expectedTotalMmk = 20.000 (tổng trước khi tăng tiếp)
    const fd2 = makeFormData({
      locale: "en",
      name: "Daw Mya",
      phone: "0978123456",
      townshipId: f.townshipId,
      addressLine: "No. 12, Pyay Road",
      paymentMethod: "COD",
      expectedTotalMmk: "20000",
      idempotencyKey: `test-idem-${tag}-2`,
    });

    const res2 = await placeOrderAction(undefined, fd2);
    expect(res2).toMatchObject({
      priceChanged: true,
      newTotal: 30_000,
    });
    expect(res2?.error).toContain("30,000");

    const orderCount2 = await prisma.order.count({ where: { accountId: user.id } });
    expect(orderCount2).toBe(0);

    // Khách xác nhận tổng mới 30.000 MMK
    const fd3 = makeFormData({
      locale: "en",
      name: "Daw Mya",
      phone: "0978123456",
      townshipId: f.townshipId,
      addressLine: "No. 12, Pyay Road",
      paymentMethod: "COD",
      expectedTotalMmk: "30000",
      idempotencyKey: `test-idem-${tag}-3`,
    });

    await expect(placeOrderAction(undefined, fd3)).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectedTo).toMatchObject({
      locale: "en",
      href: expect.objectContaining({ pathname: expect.stringMatching(/^\/order\/OD-/) }),
    });

    // Đơn đã tạo thành công với giá mới
    const order = await prisma.order.findFirstOrThrow({ where: { accountId: user.id } });
    expect(order.subtotalMmk).toBe(30_000);
    expect(order.totalMmk).toBe(30_000);
  });
});
