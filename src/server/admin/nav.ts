import { can, type Permission, type Role } from "@/server/auth/roles";
import { featureOn, type FeatureKey } from "@/lib/features";

/**
 * Menu admin (P9a): nhóm → mục, lọc theo quyền. Thuần, không import Next → test bằng Vitest.
 * `icon` là tên khoá; component icon nằm phía client (`components/admin/admin-shell.tsx`).
 */

export type NavIcon =
  | "home"
  | "cart"
  | "star"
  | "box"
  | "file"
  | "shield"
  | "truck"
  | "bell"
  | "tag"
  | "folder"
  | "coins"
  | "image"
  | "layers"
  | "chart"
  | "users"
  | "handshake"
  | "userCircle"
  | "map"
  | "warehouse"
  | "gear"
  | "bot"
  | "history";

/** Số đếm hiện ở badge (xem `navCounts`). Badge menu chỉ cho việc cần xử lý; các số còn lại dùng ở tab/lối tắt trong trang. */
export type NavCountKey =
  | "pendingOrders"
  | "awaitingStock"
  | "quarantineLots"
  | "blockedLots"
  | "pendingApplications"
  | "passwordResets"
  | "lowStock"
  | "pendingReviews"
  | "agentDrafts";

/**
 * `match` = các tiền tố đường dẫn bổ sung để mục vẫn sáng khi mở trang con/trang gộp (vd. Cảnh báo thuộc Tồn kho),
 * giữ link cũ dùng được mà không cần chuyển hướng.
 */
export type NavItem = { href: string; key: string; permission: Permission; icon: NavIcon; /** Một hoặc nhiều badge (vd Tồn kho: chờ kiểm tra + tồn thấp). */ count?: NavCountKey | NavCountKey[]; match?: string[]; /** Tính năng đang tắt (`lib/features.ts`) → mục bị ẩn khỏi menu. */ feature?: FeatureKey };
/** `key` null = nhóm không có tiêu đề (Tổng quan). */
export type NavGroup = { key: string | null; icon?: NavIcon; items: NavItem[] };

export const NAV: NavGroup[] = [
  { key: null, items: [{ href: "/admin", key: "dashboard", permission: "dashboard:view", icon: "home" }] },
  {
    key: "orders",
    icon: "cart",
    items: [
      // Đơn đặt trước (/orders/preorders) là tab "Chờ hàng" của danh sách đơn → khớp theo tiền tố /admin/orders.
      { href: "/admin/orders", key: "orderList", permission: "orders:view", icon: "cart", count: "pendingOrders" },
      { href: "/admin/orders/cod", key: "codSettlement", permission: "orders:reconcile-cod", icon: "coins" },
      // CTV: hồ sơ / đăng ký / hoa hồng & chi trả là tab của cùng mục.
      { href: "/admin/affiliates", key: "affiliatesCommission", permission: "affiliates:manage", icon: "handshake", count: "pendingApplications" },
      { href: "/admin/reviews", key: "reviews", permission: "reviews:moderate", icon: "star", count: "pendingReviews" },
    ],
  },
  {
    key: "products",
    icon: "tag",
    items: [
      // Chờ hoàn thiện / Chờ duyệt / Đang bán / Ngừng kinh doanh là tab của danh sách, không có nhóm riêng.
      { href: "/admin/products", key: "productList", permission: "catalog:manage", icon: "tag" },
      { href: "/admin/selling-prices", key: "sellingPrices", permission: "pricing:manage", icon: "coins", match: ["/admin/pricing"] },
      { href: "/admin/categories", key: "categories", permission: "catalog:manage", icon: "folder" },
      { href: "/admin/brands", key: "brands", permission: "catalog:manage", icon: "layers" },
    ],
  },
  {
    key: "groupStock",
    icon: "warehouse",
    items: [
      // Chờ kiểm tra + Cảnh báo là lối tắt trong trang Tồn kho; vẫn sáng mục này khi mở các trang đó.
      { href: "/admin/inventory", key: "inventory", permission: "stock:view", icon: "box", count: ["lowStock", "quarantineLots"], match: ["/admin/alerts"] },
      { href: "/admin/inventory/documents", key: "documents", permission: "stock:view", icon: "file", count: "agentDrafts" },
      { href: "/admin/shipments", key: "shipments", permission: "shipment:manage", icon: "truck", feature: "shipments" },
    ],
  },
  {
    key: "reports",
    icon: "chart",
    items: [
      { href: "/admin/reports", key: "salesReports", permission: "reports:view", icon: "chart" },
      { href: "/admin/reports/inventory", key: "inventoryReports", permission: "reports:view", icon: "box" },
      { href: "/admin/reports/analytics", key: "analyticsReports", permission: "reports:view", icon: "chart" },
      { href: "/admin/reports/data-health", key: "dataHealth", permission: "reports:view", icon: "shield" },
    ],
  },
  {
    key: "settings",
    icon: "gear",
    items: [
      { href: "/admin/settings", key: "storeSettings", permission: "settings:manage", icon: "gear" },
      { href: "/admin/settings/warehouses", key: "warehouseManagement", permission: "settings:manage", icon: "warehouse" },
      // Nhân viên + Khách hàng là hai tab của cùng mục.
      { href: "/admin/users", key: "accounts", permission: "users:manage", icon: "users", count: "passwordResets", match: ["/admin/customer-accounts"] },
      { href: "/admin/settings/locations", key: "locations", permission: "settings:manage", icon: "map" },
      // Banner + Bộ sưu tập là hai tab của cùng mục.
      { href: "/admin/content/banners", key: "websiteContent", permission: "content:manage", icon: "image", match: ["/admin/content"] },
      // P25 gói A: token cổng trợ lý AI + nhật ký mọi thao tác (người, AI, hệ thống).
      { href: "/admin/settings/agents", key: "aiAgents", permission: "settings:manage", icon: "bot" },
      { href: "/admin/settings/audit", key: "auditLog", permission: "settings:manage", icon: "history" },
    ],
  },
];

/** Nhóm + mục vai trò này được thấy; nhóm rỗng bị bỏ. */
export function visibleNav(role: Role, nav: NavGroup[] = NAV): NavGroup[] {
  return nav
    .map((g) => ({ ...g, items: g.items.filter((i) => can(role, i.permission) && (!i.feature || featureOn(i.feature))) }))
    .filter((g) => g.items.length > 0);
}

/** Các số đếm cần tính cho vai trò này (chỉ của mục được thấy). */
export function neededCounts(groups: NavGroup[]): Set<NavCountKey> {
  return new Set(groups.flatMap((g) => g.items.flatMap((i) => (i.count ? [i.count].flat() : []))));
}

/**
 * Mục đang mở = href (hoặc `match`) khớp tiền tố dài nhất (theo từng đoạn `/`). Trang gốc (`/admin`, cổng CTV `/ctv`)
 * chỉ khớp chính nó, để các trang ngoài menu (vd. `/admin/account`) không làm sáng "Tổng quan".
 * Trả về `href` của mục (không phải tiền tố `match`). Query bị bỏ qua; mục lọc sẵn không còn trong menu.
 */
export function activeHref(pathname: string, items: (string | { href: string; match?: string[] })[], root = "/admin"): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  let best: string | null = null;
  let bestLen = -1;
  for (const entry of items) {
    const { href, match = [] } = typeof entry === "string" ? { href: entry } : entry;
    for (const prefix of [href, ...match]) {
      const hit = prefix === root ? path === prefix : path === prefix || path.startsWith(`${prefix}/`);
      if (hit && prefix.length > bestLen) {
        best = href;
        bestLen = prefix.length;
      }
    }
  }
  return best;
}
