/**
 * Lỗi nghiệp vụ đơn hàng. `code` ổn định để storefront dịch sang my/en; `message` tiếng Việt cho admin/log.
 */
export type OrderErrorCode =
  | "invalid_phone"
  | "invalid_zone"
  | "variant_unavailable"
  | "out_of_stock"
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
