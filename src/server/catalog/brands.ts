import "server-only";
import type { Tx } from "@/server/inventory/ledger";

/**
 * Thương hiệu không có trang quản lý riêng: tạo khi gõ tên ở form SP / Excel (`saveProduct`) và
 * tự xoá khi không còn SP nào gắn vào (đổi thương hiệu của SP, xoá hẳn SP). Thương hiệu còn SP
 * ngừng kinh doanh được giữ (SP cần thương hiệu cho lịch sử); storefront chỉ hiện thương hiệu có SP đang đăng.
 */
export async function pruneEmptyBrands(tx: Tx, brandIds: (string | null | undefined)[]) {
  const ids = [...new Set(brandIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return 0;
  const res = await tx.brand.deleteMany({ where: { id: { in: ids }, products: { none: {} } } });
  return res.count;
}
