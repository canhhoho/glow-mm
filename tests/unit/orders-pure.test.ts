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
    expect(assertTransition("ship", cod("COD_CONFIRMED"))).toBe("SHIPPING");
    expect(assertTransition("complete", cod("SHIPPING"))).toBe("COMPLETED");
  });

  it("chuyển khoản: nhận tiền rồi bàn giao vận chuyển, không cần biên lai hay bước đóng gói", () => {
    expect(canTransition("ship", bank("PENDING"))).toBe(false);
    expect(assertTransition("confirmPayment", bank("PENDING"))).toBe("PAYMENT_CONFIRMED");
    expect(assertTransition("ship", bank("PAYMENT_CONFIRMED"))).toBe("SHIPPING");
    expect(availableTransitions(bank("PAYMENT_CONFIRMED"))).toEqual(["ship", "cancel"]);
  });

  it("QT3: đơn đặt trước chỉ chuyển sang chờ xác nhận khi hàng về, hoặc huỷ; không giữ hàng", () => {
    expect(availableTransitions(cod("AWAITING_STOCK"))).toEqual(["stockArrived", "cancel"]);
    expect(assertTransition("stockArrived", bank("AWAITING_STOCK"))).toBe("PENDING");
    expect(canTransition("confirmCod", cod("AWAITING_STOCK"))).toBe(false);
    expect(canTransition("ship", cod("AWAITING_STOCK"))).toBe(false);
    expect(canTransition("stockArrived", cod("PENDING"))).toBe(false);
    expect(holdsReservation("AWAITING_STOCK")).toBe(false);
  });

  it("21/11/2026: đơn đặt trước chuyển khoản trả trước → ghi nhận tiền, hàng về vào thẳng chuẩn bị giao", () => {
    const paid = { ...bank("AWAITING_STOCK"), paymentStatus: "PAID" };
    expect(availableTransitions(bank("AWAITING_STOCK"))).toEqual(["stockArrived", "confirmPrepayment", "cancel"]);
    expect(assertTransition("confirmPrepayment", bank("AWAITING_STOCK"))).toBe("AWAITING_STOCK");
    expect(canTransition("confirmPrepayment", cod("AWAITING_STOCK"))).toBe(false);
    expect(availableTransitions(paid)).toEqual(["stockArrivedPaid", "cancel"]);
    expect(assertTransition("stockArrivedPaid", paid)).toBe("PAYMENT_CONFIRMED");
    // Đã trả không đi qua PENDING (giữ hàng có hạn → cron hết hạn huỷ đơn đã trả); chưa trả không vào thẳng chuẩn bị giao.
    expect(canTransition("stockArrived", paid)).toBe(false);
    expect(canTransition("stockArrivedPaid", bank("AWAITING_STOCK"))).toBe(false);
    expect(availableTransitions({ ...bank("AWAITING_STOCK"), paymentStatus: "REFUNDED" })).toEqual(["cancel"]);
  });

  it("đơn đóng gói cũ vẫn bàn giao được; không được giao lại", () => {
    expect(assertTransition("ship", cod("PACKING"))).toBe("SHIPPING");
    expect(canTransition("ship", cod("SHIPPING"))).toBe(false);
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

  it("chỉ giữ hàng trước khi xuất kho", () => {
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
