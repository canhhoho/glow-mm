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
  | "gear";

/** Số đếm hiện ở badge (xem `navCounts`). */
export type NavCountKey = "pendingOrders" | "quarantineLots" | "blockedLots";

export type NavItem = { href: string; key: string; permission: Permission; icon: NavIcon; count?: NavCountKey };
/** `key` null = nhóm không có tiêu đề (Tổng quan). */
export type NavGroup = { key: string | null; items: NavItem[] };

export const NAV: NavGroup[] = [
  { key: null, items: [{ href: "/admin", key: "dashboard", permission: "dashboard:view", icon: "home" }] },
  {
    key: "groupSales",
    items: [
      { href: "/admin/orders", key: "orders", permission: "orders:view", icon: "cart", count: "pendingOrders" },
      { href: "/admin/reviews", key: "reviews", permission: "reviews:moderate", icon: "star" },
    ],
  },
  {
    key: "groupStock",
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
      { href: "/admin/shipments", key: "shipments", permission: "shipment:manage", icon: "truck" },
      { href: "/admin/alerts", key: "alerts", permission: "stock:view", icon: "bell", count: "blockedLots" },
    ],
  },
  {
    key: "groupCatalog",
    items: [
      { href: "/admin/products", key: "products", permission: "catalog:manage", icon: "tag" },
      { href: "/admin/categories", key: "categories", permission: "catalog:manage", icon: "folder" },
      { href: "/admin/pricing", key: "pricing", permission: "pricing:manage", icon: "coins" },
    ],
  },
  {
    key: "groupContent",
    items: [
      { href: "/admin/content/banners", key: "banners", permission: "content:manage", icon: "image" },
      { href: "/admin/content/collections", key: "collections", permission: "content:manage", icon: "layers" },
    ],
  },
  {
    key: "groupSystem",
    items: [
      { href: "/admin/reports", key: "reports", permission: "reports:view", icon: "chart" },
      { href: "/admin/users", key: "users", permission: "users:manage", icon: "users" },
      { href: "/admin/settings", key: "settings", permission: "settings:manage", icon: "gear" },
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
 * Mục đang mở = href khớp tiền tố dài nhất (theo từng đoạn `/`). Trang gốc `/admin` chỉ khớp chính nó,
 * để các trang ngoài menu (vd. `/admin/account`) không làm sáng "Tổng quan".
 */
export function activeHref(pathname: string, hrefs: string[]): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  let best: string | null = null;
  for (const h of hrefs) {
    const hit = h === "/admin" ? path === h : path === h || path.startsWith(`${h}/`);
    if (hit && (!best || h.length > best.length)) best = h;
  }
  return best;
}
