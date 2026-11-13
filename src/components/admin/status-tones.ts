import type { TONES } from "@/components/admin/ui";

/** Một bảng màu trạng thái sản phẩm cho dashboard, danh sách và trang chi tiết (trước đây mỗi nơi tự định nghĩa, lệch nhau). */
export const PRODUCT_LABEL_TONE = {
  PUBLISHED: "success",
  PENDING: "warning",
  INCOMPLETE: "danger",
  REJECTED: "danger",
  DRAFT: "neutral",
  HIDDEN: "neutral",
  ARCHIVED: "neutral",
} as const satisfies Record<string, keyof typeof TONES>;

export type ProductLabelKey = keyof typeof PRODUCT_LABEL_TONE;

/** Nhãn "bản đang sửa" của SP đã duyệt: từ chối = đỏ, còn lại = vàng (chờ xử lý). */
export const changeTone = (change: string): "danger" | "warning" => (change === "REJECTED" ? "danger" : "warning");
