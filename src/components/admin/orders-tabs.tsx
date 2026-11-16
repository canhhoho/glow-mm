import { getTranslations } from "next-intl/server";
import { TabNav } from "@/components/admin/ui";
import { navCounts } from "@/server/admin/nav-counts";

/** Trạng thái nằm trên tab; "Đã huỷ" / "Hoàn trả" nằm ở ô lọc phụ của danh sách (xem `ORDER_TAB_STATUSES`). */
export const ORDER_TAB_STATUSES = ["PENDING", "PREPARING", "SHIPPING", "COMPLETED"] as const;
export type OrdersTab = "all" | (typeof ORDER_TAB_STATUSES)[number] | "awaitingStock";

/**
 * Tab giữa các hàng đợi đơn: Chờ xác nhận · Chờ hàng (đặt trước) · Chuẩn bị giao · Đang giao · Hoàn tất.
 * Chỉ là cách trình bày lối vào — trạng thái lưu và chuyển trạng thái vẫn qua `orders/state-machine.ts`.
 * Nhãn lấy từ `Orders.status.*` (cùng chữ với huy hiệu trạng thái).
 */
export async function OrdersTabs({ active }: { active: OrdersTab | null }) {
  const [t, counts] = await Promise.all([getTranslations("Orders"), navCounts(new Set(["pendingOrders", "awaitingStock"]))]);
  const count = (n: number | undefined) => (n && n > 0 ? n : undefined);
  const status = (s: (typeof ORDER_TAB_STATUSES)[number]) => ({ href: `/admin/orders?status=${s}`, label: t(`status.${s}`), active: active === s });
  return (
    <TabNav
      label={t("title")}
      tabs={[
        { href: "/admin/orders", label: t("tabAll"), active: active === "all" },
        { ...status("PENDING"), count: count(counts.pendingOrders), tone: "brand" },
        { href: "/admin/orders/preorders", label: t("status.AWAITING_STOCK"), active: active === "awaitingStock", count: count(counts.awaitingStock), tone: "warning" },
        status("PREPARING"),
        status("SHIPPING"),
        status("COMPLETED"),
      ]}
    />
  );
}
