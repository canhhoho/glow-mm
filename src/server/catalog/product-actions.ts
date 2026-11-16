/**
 * Hành động chính ở đầu trang chi tiết sản phẩm: MỘT nút nổi bật theo trạng thái + quyền (thuần, test bằng Vitest).
 * Chỉ chọn nút nào được nhấn mạnh — mọi nút vẫn gọi đúng action/hàm domain sẵn có và server kiểm lại quyền, điều kiện mở bán.
 */
export type PrimaryProductAction = "restore" | "approvePublish" | "approveChanges" | "approveOnly" | "submit" | "publish" | "edit";

export function productPrimaryAction(p: {
  /** SP ngừng kinh doanh. */
  archived: boolean;
  published: boolean;
  /** Đang chờ duyệt. */
  pendingReview: boolean;
  /** Đã từng được duyệt (bản live có dấu duyệt). */
  approved: boolean;
  /** Có bản đang sửa chưa duyệt. */
  hasChanges: boolean;
  /** Không còn lỗi mở bán. */
  ready: boolean;
  canManage: boolean;
  canApprove: boolean;
  canPublish: boolean;
  /** Điều kiện gửi duyệt đã gồm quyền, trạng thái, lỗi mở bán (xem trang SP). */
  canSubmit: boolean;
}): PrimaryProductAction | null {
  if (p.archived) return p.canManage ? "restore" : null;
  if (p.pendingReview && p.canApprove) return p.approved ? "approveChanges" : p.canPublish ? "approvePublish" : "approveOnly";
  if (p.canSubmit) return "submit";
  if (!p.published && p.approved && !p.hasChanges && p.ready && p.canPublish) return "publish";
  return p.canManage ? "edit" : null;
}
