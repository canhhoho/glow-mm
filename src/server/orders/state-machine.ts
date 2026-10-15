/**
 * Máy trạng thái đơn hàng — NƠI DUY NHẤT định nghĩa chuyển trạng thái hợp lệ. Thuần, không phụ thuộc DB.
 *
 * PENDING → PAYMENT_CONFIRMED (chuyển khoản đã duyệt) | COD_CONFIRMED (đã gọi xác nhận COD)
 *         → PACKING (đã phân lô FEFO, trừ kho) → SHIPPING → COMPLETED
 * Nhánh: CANCELLED (trước khi đóng gói), RETURNED (sau khi giao/đang giao).
 */
import type { Permission } from "@/server/auth/roles";

export const ORDER_STATUSES = [
  "PENDING",
  "PAYMENT_CONFIRMED",
  "COD_CONFIRMED",
  "PACKING",
  "SHIPPING",
  "COMPLETED",
  "CANCELLED",
  "RETURNED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type PaymentMethod = "COD" | "BANK_TRANSFER";

export type Transition = {
  from: OrderStatus[];
  to: OrderStatus;
  /** Giới hạn theo phương thức thanh toán (nếu có). */
  method?: PaymentMethod;
  permission: Permission;
};

export const TRANSITIONS = {
  confirmPayment: { from: ["PENDING"], to: "PAYMENT_CONFIRMED", method: "BANK_TRANSFER", permission: "orders:confirm-payment" },
  confirmCod: { from: ["PENDING"], to: "COD_CONFIRMED", method: "COD", permission: "orders:confirm-payment" },
  pack: { from: ["PAYMENT_CONFIRMED", "COD_CONFIRMED"], to: "PACKING", permission: "orders:pack" },
  ship: { from: ["PACKING"], to: "SHIPPING", permission: "orders:ship" },
  complete: { from: ["SHIPPING"], to: "COMPLETED", permission: "orders:ship" },
  cancel: { from: ["PENDING", "PAYMENT_CONFIRMED", "COD_CONFIRMED"], to: "CANCELLED", permission: "orders:cancel" },
  returned: { from: ["SHIPPING", "COMPLETED"], to: "RETURNED", permission: "orders:return" },
} as const satisfies Record<string, Transition>;

export type TransitionName = keyof typeof TRANSITIONS;

export class TransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransitionError";
  }
}

export function canTransition(name: TransitionName, order: { status: OrderStatus; paymentMethod: PaymentMethod }): boolean {
  const t: Transition = TRANSITIONS[name];
  if (!t.from.includes(order.status)) return false;
  if (t.method && t.method !== order.paymentMethod) return false;
  return true;
}

export function assertTransition(name: TransitionName, order: { status: OrderStatus; paymentMethod: PaymentMethod }): OrderStatus {
  if (!canTransition(name, order)) {
    throw new TransitionError(`Không thể "${name}" khi đơn đang ở trạng thái ${order.status} (${order.paymentMethod})`);
  }
  return TRANSITIONS[name].to;
}

/** Các thao tác khả dụng cho một đơn (dùng để hiện nút trong admin). */
export function availableTransitions(order: { status: OrderStatus; paymentMethod: PaymentMethod }): TransitionName[] {
  return (Object.keys(TRANSITIONS) as TransitionName[]).filter((n) => canTransition(n, order));
}

/** Trạng thái còn giữ hàng (reservation ACTIVE). Từ PACKING trở đi hàng đã trừ kho thật. */
export function holdsReservation(status: OrderStatus): boolean {
  return status === "PENDING" || status === "PAYMENT_CONFIRMED" || status === "COD_CONFIRMED";
}
