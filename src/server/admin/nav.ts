import { can, type Permission, type Role } from "@/server/auth/roles";

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
  | "gear";

/** Số đếm hiện ở badge (xem `navCounts`). */
export type NavCountKey =
  | "pendingOrders"
  | "awaitingStock"
  | "quarantineLots"
  | "blockedLots"
  | "pendingApplications"
  | "passwordResets"
  | "catalogIncomplete"
  | "catalogReview"
  | "catalogPublished";

export type NavItem = { href: string; key: string; permission: Permission; icon: NavIcon; count?: NavCountKey; section?: string };
/** `key` null = nhóm không có tiêu đề (Tổng quan). */
export type NavGroup = { key: string | null; icon?: NavIcon; items: NavItem[] };

export const NAV: NavGroup[] = [
  { key: null, items: [{ href: "/admin", key: "dashboard", permission: "dashboard:view", icon: "home" }] },
  {
    key: "orders",
    icon: "cart",
    items: [
      { href: "/admin/orders", key: "orderList", permission: "orders:view", icon: "cart", count: "pendingOrders" },
      { href: "/admin/orders/preorders", key: "preorders", permission: "orders:view", icon: "cart", count: "awaitingStock" },
      { href: "/admin/orders/cod", key: "codSettlement", permission: "orders:reconcile-cod", icon: "coins" },
      { href: "/admin/reviews", key: "reviews", permission: "reviews:moderate", icon: "star" },
    ],
  },
  {
    key: "products",
    icon: "tag",
    items: [
      { href: "/admin/products", key: "productList", permission: "catalog:manage", icon: "tag" },
      { href: "/admin/categories", key: "categories", permission: "catalog:manage", icon: "folder" },
      { href: "/admin/selling-prices", key: "sellingPrices", permission: "pricing:manage", icon: "coins" },
    ],
  },
  {
    key: "groupStock",
    icon: "warehouse",
    items: [
      { href: "/admin/inventory", key: "inventory", permission: "stock:view", icon: "box" },
      { href: "/admin/inventory/documents", key: "documents", permission: "stock:view", icon: "file" },
      {
        href: "/admin/inventory/quarantine",
        key: "quarantine",
        permission: "stock:view",
        icon: "shield",
        count: "quarantineLots",
      },
      { href: "/admin/alerts", key: "alerts", permission: "stock:view", icon: "bell", count: "blockedLots" },
      { href: "/admin/shipments", key: "shipments", permission: "shipment:manage", icon: "truck" },
    ],
  },
  {
    // P3: lối tắt tới danh sách SP đã lọc theo trạng thái đăng bán (không có trang riêng).
    key: "groupPublishing",
    icon: "shield",
    items: [
      { href: "/admin/products?status=incomplete", key: "publishIncomplete", permission: "catalog:manage", icon: "file", count: "catalogIncomplete" },
      { href: "/admin/products?status=review", key: "publishReview", permission: "catalog:manage", icon: "shield", count: "catalogReview" },
      { href: "/admin/products?status=published", key: "publishLive", permission: "catalog:manage", icon: "tag", count: "catalogPublished" },
    ],
  },
  {
    key: "groupAccounts",
    icon: "users",
    items: [
      { href: "/admin/users", key: "users", permission: "users:manage", icon: "users" },
      { href: "/admin/customer-accounts", key: "customers", permission: "users:manage", icon: "userCircle", count: "passwordResets" },
    ],
  },
  {
    key: "affiliates",
    icon: "handshake",
    items: [
      { href: "/admin/affiliates", key: "affiliateList", permission: "affiliates:manage", icon: "handshake" },
      { href: "/admin/affiliates/applications", key: "affiliateApplications", permission: "affiliates:manage", icon: "file", count: "pendingApplications" },
      { href: "/admin/affiliates/commissions", key: "affiliateCommissions", permission: "affiliates:manage", icon: "coins" },
    ],
  },
  {
    key: "reports",
    icon: "chart",
    items: [
      { href: "/admin/reports", key: "salesReports", permission: "reports:view", icon: "chart" },
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
      { href: "/admin/settings/locations", key: "locations", permission: "settings:manage", icon: "map" },
      { href: "/admin/content/banners", key: "banners", permission: "content:manage", icon: "image", section: "groupContent" },
      { href: "/admin/content/collections", key: "collections", permission: "content:manage", icon: "layers", section: "groupContent" },
    ],
  },
];

/** Nhóm + mục vai trò này được thấy; nhóm rỗng bị bỏ. */
export function visibleNav(role: Role, nav: NavGroup[] = NAV): NavGroup[] {
  return nav
    .map((g) => ({ ...g, items: g.items.filter((i) => can(role, i.permission)) }))
    .filter((g) => g.items.length > 0);
}

/** Các số đếm cần tính cho vai trò này (chỉ của mục được thấy). */
export function neededCounts(groups: NavGroup[]): Set<NavCountKey> {
  return new Set(groups.flatMap((g) => g.items.flatMap((i) => (i.count ? [i.count] : []))));
}

/**
 * Mục đang mở = href khớp tiền tố dài nhất (theo từng đoạn `/`). Trang gốc (`/admin`, cổng CTV `/ctv`) chỉ khớp
 * chính nó, để các trang ngoài menu (vd. `/admin/account`) không làm sáng "Tổng quan".
 */
export function activeHref(pathname: string, hrefs: string[], root = "/admin"): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  let best: string | null = null;
  for (const h of hrefs) {
    const hit = h === root ? path === h : path === h || path.startsWith(`${h}/`);
    if (hit && (!best || h.length > best.length)) best = h;
  }
  return best;
}
