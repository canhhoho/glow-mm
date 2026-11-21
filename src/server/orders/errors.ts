/**
 * Lỗi nghiệp vụ đơn hàng. `code` ổn định để storefront dịch sang my/en; `message` tiếng Việt cho admin/log.
 */
export type OrderErrorCode =
  | "invalid_phone"
  | "invalid_zone"
  | "variant_unavailable"
  /** Giỏ trống lúc bấm đặt hàng (web). */
  | "cart_empty"
  | "price_missing"
  | "pick_mismatch"
  | "pick_required"
  | "out_of_stock"
  | "preorder_unconfirmed"
  /** 16/11: lô sắp xuất chưa có giá vốn (cả thực tế lẫn tạm tính) → chặn bàn giao. */
  | "cost_missing"
  | "not_found"
  | "invalid_transition"
  | "forbidden"
  | "invalid_file"
  | "proof_not_allowed"
  | "checkout_disabled"
  | "invalid_affiliate";

export class OrderError extends Error {
  constructor(
    public readonly code: OrderErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "OrderError";
  }
}
