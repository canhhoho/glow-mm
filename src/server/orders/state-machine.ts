/**
 * Máy trạng thái đơn hàng — NƠI DUY NHẤT định nghĩa chuyển trạng thái hợp lệ. Thuần, không phụ thuộc DB.
 *
 * PENDING → PAYMENT_CONFIRMED | COD_CONFIRMED (chuẩn bị giao) → SHIPPING → COMPLETED.
 * QT3: đơn đặt trước AWAITING_STOCK (không giữ hàng) → `stockArrived` → PENDING (giữ hàng như đơn mới) hoặc huỷ.
 * 21/11/2026: khách chuyển khoản trước cho đơn đặt trước → `confirmPrepayment` (vẫn AWAITING_STOCK, đã thanh toán);
 * hàng về → `stockArrivedPaid` → PAYMENT_CONFIRMED (giữ hàng không hết hạn, không qua PENDING để cron hết hạn không huỷ đơn đã trả).
 * Xuất kho FEFO khi bàn giao vận chuyển. PACKING chỉ còn cho đơn cũ đã xuất kho.
 * Nhánh: CANCELLED (trước khi xuất kho), RETURNED (sau khi giao/đang giao).
 */
import type { Permission } from "@/server/auth/roles";

export const ORDER_STATUSES = [
  "AWAITING_STOCK",
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
/** Điều kiện thanh toán của một chuyển trạng thái: PAID = đã nhận tiền; UNPAID = chưa nhận (không gồm đã hoàn tiền). */
export type PaymentState = "UNPAID" | "PAID";

/** Gộp các trạng thái lưu trữ cũ thành một bước hiển thị; không sửa lịch sử đơn. */
export const PREPARING_STATUSES = ["PAYMENT_CONFIRMED", "COD_CONFIRMED", "PACKING"] as const;
export const ORDER_FILTER_STATUSES = ["AWAITING_STOCK", "PENDING", "PREPARING", "SHIPPING", "COMPLETED", "CANCELLED", "RETURNED"] as const;

export type Transition = {
  from: OrderStatus[];
  to: OrderStatus;
  /** Giới hạn theo phương thức thanh toán (nếu có). */
  method?: PaymentMethod;
  /** Giới hạn theo tình trạng thanh toán (nếu có); đơn không truyền `paymentStatus` coi như UNPAID. */
  payment?: PaymentState;
  permission: Permission;
};

export const TRANSITIONS = {
  stockArrived: { from: ["AWAITING_STOCK"], to: "PENDING", payment: "UNPAID", permission: "orders:confirm-payment" },
  confirmPrepayment: { from: ["AWAITING_STOCK"], to: "AWAITING_STOCK", method: "BANK_TRANSFER", payment: "UNPAID", permission: "orders:confirm-payment" },
  stockArrivedPaid: { from: ["AWAITING_STOCK"], to: "PAYMENT_CONFIRMED", method: "BANK_TRANSFER", payment: "PAID", permission: "orders:confirm-payment" },
  confirmPayment: { from: ["PENDING"], to: "PAYMENT_CONFIRMED", method: "BANK_TRANSFER", permission: "orders:confirm-payment" },
  confirmCod: { from: ["PENDING"], to: "COD_CONFIRMED", method: "COD", permission: "orders:confirm-payment" },
  ship: { from: [...PREPARING_STATUSES], to: "SHIPPING", permission: "orders:ship" },
  complete: { from: ["SHIPPING"], to: "COMPLETED", permission: "orders:ship" },
  cancel: { from: ["AWAITING_STOCK", "PENDING", "PAYMENT_CONFIRMED", "COD_CONFIRMED"], to: "CANCELLED", permission: "orders:cancel" },
  returned: { from: ["SHIPPING", "COMPLETED"], to: "RETURNED", permission: "orders:return" },
} as const satisfies Record<string, Transition>;

export type TransitionName = keyof typeof TRANSITIONS;

export class TransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransitionError";
  }
}

/** Đơn tối thiểu để kiểm chuyển trạng thái. */
export type OrderRef = { status: OrderStatus; paymentMethod: PaymentMethod; paymentStatus?: string };

function paymentState(status: string | undefined): PaymentState | null {
  if (status === "PAID") return "PAID";
  return status === "REFUNDED" ? null : "UNPAID";
}

export function canTransition(name: TransitionName, order: OrderRef): boolean {
  const t: Transition = TRANSITIONS[name];
  if (!t.from.includes(order.status)) return false;
  if (t.method && t.method !== order.paymentMethod) return false;
  if (t.payment && t.payment !== paymentState(order.paymentStatus)) return false;
  return true;
}

export function assertTransition(name: TransitionName, order: OrderRef): OrderStatus {
  if (!canTransition(name, order)) {
    throw new TransitionError(`Không thể "${name}" khi đơn đang ở trạng thái ${order.status} (${order.paymentMethod})`);
  }
  return TRANSITIONS[name].to;
}

/** Các thao tác khả dụng cho một đơn (dùng để hiện nút trong admin). */
export function availableTransitions(order: OrderRef): TransitionName[] {
  return (Object.keys(TRANSITIONS) as TransitionName[]).filter((n) => canTransition(n, order));
}

/** Giữ hàng đến khi bàn giao; PACKING cũ đã xuất kho nên không còn giữ hàng. */
export function holdsReservation(status: OrderStatus): boolean {
  return status === "PENDING" || status === "PAYMENT_CONFIRMED" || status === "COD_CONFIRMED";
}
