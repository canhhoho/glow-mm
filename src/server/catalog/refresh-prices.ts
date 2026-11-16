import "server-only";
import { revalidatePath, updateTag } from "next/cache";
import { CATALOG_TAG } from "./category-tree";

/**
 * Làm mới sau khi giá / hoa hồng CTV (live hoặc chờ duyệt) có thể đã đổi — R8, docs/ban-do-nghiep-vu-admin.md.
 * Tầng action (cần `next/cache`), KHÔNG gọi từ hàm domain. Mọi action đổi giá gọi hàm này thay vì tự liệt kê:
 * Giá bán thủ công MMK, bảng tính / thủ công VND, Excel, duyệt / huỷ bản đang sửa, thao tác hàng loạt trên SP.
 *  - Storefront: `CATALOG_TAG` (thẻ / trang SP hiện giá) — gọi NGAY sau khi transaction đổi giá commit.
 *  - Admin: Giá bán (mọi tab: thủ công, tự động, tỷ giá, lịch sử giá) + Thủ công VND, bản tính, danh sách SP + mọi trang SP.
 * Thêm tỷ giá cũng gọi hàm này (bảng tính / thủ công VND đọc tỷ giá mới nhất).
 */
export function refreshPrices(opts: { runId?: string } = {}) {
  updateTag(CATALOG_TAG);
  revalidatePath("/admin/selling-prices");
  revalidatePath("/admin/selling-prices/manual");
  if (opts.runId) revalidatePath(`/admin/pricing/runs/${opts.runId}`);
  revalidatePath("/admin/products", "layout");
}
