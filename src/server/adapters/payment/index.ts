/**
 * Adapter thanh toán. Phase 1: COD + chuyển khoản thủ công (upload biên lai, nhân viên duyệt).
 * Cổng thanh toán / ví điện tử sau này: thêm một PaymentProvider mới, không sửa luồng đơn.
 */
export type PaymentMethodCode = "COD" | "BANK_TRANSFER";

export type PaymentInit =
  | { kind: "none" } // COD: thu tiền khi giao
  | { kind: "manual-transfer"; instructions: string } // hiện thông tin tài khoản cho khách
  | { kind: "redirect"; url: string }; // gateway tương lai

export interface PaymentProvider {
  code: PaymentMethodCode;
  /** Có cần giữ hàng với thời hạn (tự nhả) không. */
  reservationExpires: boolean;
  init(order: { code: string; totalMmk: number }): Promise<PaymentInit>;
}

export const codProvider: PaymentProvider = {
  code: "COD",
  reservationExpires: false, // huỷ theo hạn gọi xác nhận COD (cron cancel-unconfirmed-cod)
  async init() {
    return { kind: "none" };
  },
};

export function bankTransferProvider(instructions: string): PaymentProvider {
  return {
    code: "BANK_TRANSFER",
    reservationExpires: true,
    async init(order) {
      return { kind: "manual-transfer", instructions: `${instructions}\nRef: ${order.code}` };
    },
  };
}
