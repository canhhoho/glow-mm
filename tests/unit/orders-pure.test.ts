import { describe, expect, it } from "vitest";
import {
  assertTransition,
  availableTransitions,
  canTransition,
  holdsReservation,
  TransitionError,
} from "@/server/orders/state-machine";
import { normalizeMmPhone, phoneSearchDigits } from "@/lib/phone";
import { orderTotals } from "@/server/orders/pricing";

describe("Máy trạng thái đơn", () => {
  const cod = (status: Parameters<typeof canTransition>[1]["status"]) => ({ status, paymentMethod: "COD" as const });
  const bank = (status: Parameters<typeof canTransition>[1]["status"]) => ({ status, paymentMethod: "BANK_TRANSFER" as const });

  it("luồng COD đầy đủ", () => {
    expect(assertTransition("confirmCod", cod("PENDING"))).toBe("COD_CONFIRMED");
    expect(assertTransition("pack", cod("COD_CONFIRMED"))).toBe("PACKING");
    expect(assertTransition("ship", cod("PACKING"))).toBe("SHIPPING");
    expect(assertTransition("complete", cod("SHIPPING"))).toBe("COMPLETED");
  });

  it("luồng chuyển khoản: phải duyệt thanh toán trước khi đóng gói", () => {
    expect(canTransition("pack", bank("PENDING"))).toBe(false);
    expect(assertTransition("confirmPayment", bank("PENDING"))).toBe("PAYMENT_CONFIRMED");
    expect(canTransition("pack", bank("PAYMENT_CONFIRMED"))).toBe(true);
  });

  it("không dùng nhầm thao tác của phương thức khác", () => {
    expect(canTransition("confirmCod", bank("PENDING"))).toBe(false);
    expect(canTransition("confirmPayment", cod("PENDING"))).toBe(false);
  });

  it("chỉ huỷ được trước khi đóng gói; trả hàng chỉ sau khi giao", () => {
    expect(canTransition("cancel", cod("PENDING"))).toBe(true);
    expect(canTransition("cancel", cod("PACKING"))).toBe(false);
    expect(canTransition("cancel", cod("SHIPPING"))).toBe(false);
    expect(canTransition("returned", cod("PACKING"))).toBe(false);
    expect(canTransition("returned", cod("SHIPPING"))).toBe(true);
    expect(canTransition("returned", cod("COMPLETED"))).toBe(true);
  });

  it("trạng thái kết thúc không có thao tác tiếp", () => {
    expect(availableTransitions(cod("CANCELLED"))).toEqual([]);
    expect(availableTransitions(cod("RETURNED"))).toEqual([]);
    expect(() => assertTransition("ship", cod("CANCELLED"))).toThrow(TransitionError);
  });

  it("chỉ giữ hàng khi chưa đóng gói", () => {
    expect(holdsReservation("PENDING")).toBe(true);
    expect(holdsReservation("COD_CONFIRMED")).toBe(true);
    expect(holdsReservation("PACKING")).toBe(false);
    expect(holdsReservation("CANCELLED")).toBe(false);
  });
});

describe("Tính tiền & SĐT", () => {
  it("tổng = tạm tính + phí ship", () => {
    expect(
      orderTotals(
        [
          { variantId: "a", qty: 2, unitPriceMmk: 25000 },
          { variantId: "b", qty: 1, unitPriceMmk: 18500 },
        ],
        2500,
      ),
    ).toEqual({ subtotalMmk: 68500, shippingFeeMmk: 2500, totalMmk: 71000 });
    expect(() => orderTotals([{ variantId: "a", qty: 0, unitPriceMmk: 1 }], 0)).toThrow();
  });

  it("chuẩn hoá SĐT Myanmar", () => {
    expect(normalizeMmPhone("09 7812 3456")).toBe("0978123456");
    expect(normalizeMmPhone("+95 9 7812 3456")).toBe("0978123456");
    expect(normalizeMmPhone("959781234567")).toBe("09781234567");
    expect(normalizeMmPhone("978123456")).toBe("0978123456");
    expect(normalizeMmPhone("၀၉၇၈၁၂၃၄၅၆")).toBe("0978123456");
    expect(normalizeMmPhone("12345")).toBeNull();
    expect(normalizeMmPhone("0812345678")).toBeNull();
  });

  it("phoneSearchDigits: chỉ lấy số khi từ khoá toàn ký tự SĐT và ≥ 3 chữ số", () => {
    expect(phoneSearchDigits(" 09 7812-3456 ")).toBe("0978123456");
    expect(phoneSearchDigits("၃၄၅၆")).toBe("3456");
    expect(phoneSearchDigits("khongtontai123")).toBe("");
    expect(phoneSearchDigits("E2E1")).toBe("");
    expect(phoneSearchDigits("12")).toBe("");
  });
});
