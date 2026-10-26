/**
 * RBAC — nguồn sự thật duy nhất cho quyền. Không import Next/Prisma để test thuần.
 * Role khớp enum Role trong prisma/schema.prisma.
 */
export const ROLES = ["ADMIN", "WAREHOUSE_MANAGER", "ORDER_STAFF"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Cộng tác viên (P10) — cũng là user Better Auth nhưng KHÔNG thuộc ROLES (không phải nhân viên):
 * `getStaffUser` từ chối → không vào được /admin; chỉ vào cổng /ctv qua `requireAffiliate`.
 */
export const AFFILIATE_ROLE = "AFFILIATE";

export const PERMISSIONS = {
  "dashboard:view": ["ADMIN", "WAREHOUSE_MANAGER", "ORDER_STAFF"],
  "catalog:manage": ["ADMIN"],
  /** Nội dung trang chủ: banner, bộ sưu tập (P6). */
  "content:manage": ["ADMIN"],
  "pricing:manage": ["ADMIN"],
  "users:manage": ["ADMIN"],
  "settings:manage": ["ADMIN"],
  "reports:view": ["ADMIN"],
  "stock:view": ["ADMIN", "WAREHOUSE_MANAGER", "ORDER_STAFF"],
  "stock:receive": ["ADMIN", "WAREHOUSE_MANAGER"],
  "stock:issue": ["ADMIN", "WAREHOUSE_MANAGER"],
  "stock:transfer": ["ADMIN", "WAREHOUSE_MANAGER"],
  "stock:adjust": ["ADMIN", "WAREHOUSE_MANAGER"],
  "shipment:manage": ["ADMIN", "WAREHOUSE_MANAGER"],
  "orders:view": ["ADMIN", "WAREHOUSE_MANAGER", "ORDER_STAFF"],
  /** Gán / đổi / bỏ CTV của một đơn (P10). */
  "orders:assign-affiliate": ["ADMIN", "ORDER_STAFF"],
  "orders:create": ["ADMIN", "ORDER_STAFF"],
  "orders:confirm-payment": ["ADMIN", "ORDER_STAFF"],
  "orders:pack": ["ADMIN", "WAREHOUSE_MANAGER"],
  "orders:ship": ["ADMIN", "ORDER_STAFF"],
  "orders:cancel": ["ADMIN", "ORDER_STAFF"],
  "orders:return": ["ADMIN", "ORDER_STAFF", "WAREHOUSE_MANAGER"],
  "reviews:moderate": ["ADMIN", "ORDER_STAFF"],
  /** Tạo/sửa/khoá CTV, ghi nhận chi trả hoa hồng (P10). */
  "affiliates:manage": ["ADMIN"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

/** Độ dài tối thiểu khi nhân viên tự đặt mật khẩu mới. */
export const MIN_STAFF_PASSWORD = 12;

/** Mã lỗi Better Auth khi tài khoản bị khoá đăng nhập (form đăng nhập hiện thông báo riêng). */
export const USER_INACTIVE = "USER_INACTIVE";

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}
