import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUser = {
  id: "user-1",
  name: "Daw Mya",
  email: "mya@glow.local",
  locale: "en",
  phone: "0978123456",
  contact: "mya@glow.local",
  affiliate: null,
};

let cartLines = "var12345:2";
let cartDetailsResult = {
  ok: true,
  subtotalMmk: 25_000,
  lines: [{ variantId: "var12345", qty: 2, priceMmk: 12_500 }],
  preorder: false,
};

const mockCreateOrder = vi.fn();
const mockRedirect = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    variant: {
      findMany: vi.fn(async () => [{ id: "var12345" }]),
    },
    order: {
      findFirst: vi.fn(async () => null),
    },
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "cart" ? { value: cartLines } : undefined),
    set: vi.fn(),
    delete: vi.fn(),
  }),
  headers: async () => new Headers(),
}));

vi.mock("@/server/auth/customer-session", () => ({
  requireCustomer: vi.fn(async () => mockUser),
  getCustomerUser: vi.fn(async () => mockUser),
}));

vi.mock("@/server/catalog/store-queries", () => ({
  getCartDetails: vi.fn(async () => cartDetailsResult),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string, params?: Record<string, unknown>) => {
    if (params?.total) return `Price changed: ${String(params.total)}`;
    return key;
  }),
}));

vi.mock("@/server/orders/orders", () => ({
  createOrder: (...args: unknown[]) => mockCreateOrder(...args),
  findOrderForCustomer: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  redirect: (...args: unknown[]) => {
    mockRedirect(...args);
    throw new Error("NEXT_REDIRECT");
  },
}));

import { placeOrderAction } from "@/server/cart/actions";

function makeFormData(data: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) fd.append(k, v);
  return fd;
}

describe("Checkout A1 (Unit) — Giá đổi yêu cầu khách xác nhận lại", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cartLines = "var12345:2";
    cartDetailsResult = {
      ok: true,
      subtotalMmk: 25_000,
      lines: [{ variantId: "var12345", qty: 2, priceMmk: 12_500 }],
      preorder: false,
    };
  });

  it("expectedTotalMmk khác tổng hiện hành → không tạo đơn, trả priceChanged: true và newTotal", async () => {
    const fd = makeFormData({
      locale: "en",
      name: "Daw Mya",
      phone: "0978123456",
      townshipId: "tw-1",
      addressLine: "No. 12, Pyay Road",
      paymentMethod: "COD",
      expectedTotalMmk: "20000", // Khách thấy 20.000 nhưng giá hiện hành là 25.000
      idempotencyKey: "test-idem-1",
    });

    const res = await placeOrderAction(undefined, fd);

    expect(res).toMatchObject({
      priceChanged: true,
      newTotal: 25_000,
    });
    expect(res?.error).toBeTruthy();
    expect(mockCreateOrder).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("expectedTotalMmk khớp tổng hiện hành → gọi createOrder tạo đơn", async () => {
    mockCreateOrder.mockResolvedValueOnce({
      id: "ord-1",
      code: "OD-123456",
      recipientName: "Daw Mya",
      recipientPhone: "0978123456",
      townshipId: "tw-1",
      addressText: "No. 12, Pyay Road",
    });

    const fd = makeFormData({
      locale: "en",
      name: "Daw Mya",
      phone: "0978123456",
      townshipId: "tw-1",
      addressLine: "No. 12, Pyay Road",
      paymentMethod: "COD",
      expectedTotalMmk: "25000", // Khớp với 25.000
      idempotencyKey: "test-idem-2",
    });

    await expect(placeOrderAction(undefined, fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(mockCreateOrder).toHaveBeenCalledTimes(1);
    expect(mockRedirect).toHaveBeenCalledWith(
      expect.objectContaining({
        href: { pathname: "/order/OD-123456", query: { placed: "1" } },
        locale: "en",
      }),
    );
  });

  it("cart.ok = false (hết hàng) → không kích hoạt priceChanged mà để createOrder kiểm lỗi", async () => {
    cartDetailsResult = {
      ok: false,
      subtotalMmk: 25_000,
      lines: [{ variantId: "var12345", qty: 2, priceMmk: 12_500 }],
      preorder: false,
    };

    const fd = makeFormData({
      locale: "en",
      name: "Daw Mya",
      phone: "0978123456",
      townshipId: "tw-1",
      addressLine: "No. 12, Pyay Road",
      paymentMethod: "COD",
      expectedTotalMmk: "20000",
      idempotencyKey: "test-idem-3",
    });

    // Khi cart.ok = false, price check bỏ qua, form đi tiếp vào createOrder
    mockCreateOrder.mockRejectedValueOnce(new Error("out_of_stock"));
    const res = await placeOrderAction(undefined, fd);
    expect(res?.priceChanged).toBeUndefined();
    expect(mockCreateOrder).toHaveBeenCalledTimes(1);
  });

  it("A2: Hết hàng chuyển sang preorder mà khách chưa thấy (expectedPreorder = 0) → trả needsPreorderConfirm: true", async () => {
    cartDetailsResult = {
      ok: true,
      subtotalMmk: 25_000,
      lines: [{ variantId: "var12345", qty: 2, priceMmk: 12_500 }],
      preorder: true, // Chuyển thành đặt trước
    };

    const fd = makeFormData({
      locale: "en",
      name: "Daw Mya",
      phone: "0978123456",
      townshipId: "tw-1",
      addressLine: "No. 12, Pyay Road",
      paymentMethod: "COD",
      expectedTotalMmk: "25000",
      expectedPreorder: "0", // Khách tưởng hàng có sẵn
      idempotencyKey: "test-idem-4",
    });

    const res = await placeOrderAction(undefined, fd);
    expect(res).toMatchObject({
      needsPreorderConfirm: true,
    });
    expect(res?.error).toBeTruthy();
    expect(mockCreateOrder).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("A2: Khách xác nhận đặt trước (expectedPreorder = 1) → gọi createOrder tạo đơn", async () => {
    cartDetailsResult = {
      ok: true,
      subtotalMmk: 25_000,
      lines: [{ variantId: "var12345", qty: 2, priceMmk: 12_500 }],
      preorder: true,
    };

    mockCreateOrder.mockResolvedValueOnce({
      id: "ord-pre",
      code: "OD-PRE123",
      recipientName: "Daw Mya",
      recipientPhone: "0978123456",
      townshipId: "tw-1",
      addressText: "No. 12, Pyay Road",
    });

    const fd = makeFormData({
      locale: "en",
      name: "Daw Mya",
      phone: "0978123456",
      townshipId: "tw-1",
      addressLine: "No. 12, Pyay Road",
      paymentMethod: "COD",
      expectedTotalMmk: "25000",
      expectedPreorder: "1", // Khách đã xác nhận đặt trước
      idempotencyKey: "test-idem-5",
    });

    await expect(placeOrderAction(undefined, fd)).rejects.toThrow("NEXT_REDIRECT");
    expect(mockCreateOrder).toHaveBeenCalledTimes(1);
    expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({ expectedPreorder: true }),
      expect.anything(),
    );
  });
});
