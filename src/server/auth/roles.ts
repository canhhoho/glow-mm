/**
 * RBAC — nguồn sự thật duy nhất cho quyền. Không import Next/Prisma để test thuần.
 * Role khớp enum Role trong prisma/schema.prisma.
 */
export const ROLES = ["ADMIN", "WAREHOUSE_MANAGER", "ORDER_STAFF"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = {
  "dashboard:view": ["ADMIN", "WAREHOUSE_MANAGER", "ORDER_STAFF"],
  "catalog:manage": ["ADMIN"],
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
  "orders:create": ["ADMIN", "ORDER_STAFF"],
  "orders:confirm-payment": ["ADMIN", "ORDER_STAFF"],
  "orders:pack": ["ADMIN", "WAREHOUSE_MANAGER"],
  "orders:ship": ["ADMIN", "ORDER_STAFF"],
  "orders:cancel": ["ADMIN", "ORDER_STAFF"],
  "orders:return": ["ADMIN", "ORDER_STAFF", "WAREHOUSE_MANAGER"],
  "reviews:moderate": ["ADMIN", "ORDER_STAFF"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

/** Độ dài tối thiểu khi nhân viên tự đặt mật khẩu mới. */
export const MIN_STAFF_PASSWORD = 12;

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}
