/**
 * Máy trạng thái đơn hàng — NƠI DUY NHẤT định nghĩa chuyển trạng thái hợp lệ. Thuần, không phụ thuộc DB.
 *
 * PENDING → PAYMENT_CONFIRMED | COD_CONFIRMED (chuẩn bị giao) → SHIPPING → COMPLETED.
 * Xuất kho FEFO khi bàn giao vận chuyển. PACKING chỉ còn cho đơn cũ đã xuất kho.
 * Nhánh: CANCELLED (trước khi xuất kho), RETURNED (sau khi giao/đang giao).
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

/** Gộp các trạng thái lưu trữ cũ thành một bước hiển thị; không sửa lịch sử đơn. */
export const PREPARING_STATUSES = ["PAYMENT_CONFIRMED", "COD_CONFIRMED", "PACKING"] as const;
export const ORDER_FILTER_STATUSES = ["PENDING", "PREPARING", "SHIPPING", "COMPLETED", "CANCELLED", "RETURNED"] as const;

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
  ship: { from: [...PREPARING_STATUSES], to: "SHIPPING", permission: "orders:ship" },
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

/** Giữ hàng đến khi bàn giao; PACKING cũ đã xuất kho nên không còn giữ hàng. */
export function holdsReservation(status: OrderStatus): boolean {
  return status === "PENDING" || status === "PAYMENT_CONFIRMED" || status === "COD_CONFIRMED";
}
