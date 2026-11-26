import { cn } from "@/lib/utils";

/**
 * Thanh mục dạng viên (pill) — điều hướng cấp khu: tab tài khoản khách (storefront), thanh mục cổng CTV (desktop).
 * Tab trong trang admin/CTV dùng `TabNav` (gạch chân); chuyển chế độ xem dùng `Segmented` (docs/design-system.md §7).
 * Chuỗi class thuần (không JS) → dùng được ở server lẫn client component.
 */
export const PILL_NAV = {
  /** Khung: nền thẻ, viền mảnh, các mục cách 4px. */
  list: "flex gap-1 rounded-xl bg-card p-1 ring-1 ring-border",
  item: "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-sm whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
} as const;

/** Lớp một mục: đang mở = nền màu nhấn chữ trắng; còn lại = chữ thường (đủ tương phản trên nền kem/trắng), hover nền nhạt. */
export const pillNavItem = (active: boolean, className?: string) =>
  cn(PILL_NAV.item, active ? "bg-primary font-medium text-primary-foreground" : "text-foreground hover:bg-muted", className);
