import { createHash } from "node:crypto";

/**
 * Duyệt SP (thuần, không DB → unit test). P1-A, kế hoạch admin bản sửa 5 §4.
 *
 * Dấu vân tay = những gì CẦN DUYỆT (khách thấy): tên + mô tả (my, en), danh mục, thương hiệu, biến thể (SKU, nhãn,
 * giá, đang bán, combo + thành phần), tập ảnh (thêm/xoá). Không gồm (ghi thẳng, không cần duyệt): khối lượng,
 * thứ tự/alt ảnh, hoa hồng CTV, lãi cố định, giá vốn, tồn, đặt trước, kho bán, tag, ghi chú bảo quản.
 */
export type ApprovalSnapshot = {
  categoryId: string;
  brandId: string;
  content: { locale: string; name: string; description: string | null }[];
  variants: { sku: string; label: string; priceMmk: number; active: boolean; isBundle?: boolean; components?: { componentId: string; qty: number }[] }[];
  /** fileId của ảnh (thứ tự không tính). */
  images: string[];
};

export function approvalHash(s: ApprovalSnapshot): string {
  // Chuẩn hoá như `writeProduct`: luôn có hai bản dịch, tên trống lấy theo tên còn lại (dữ liệu cũ thiếu một bản
  // dịch không làm dấu vân tay đổi khi lưu lại).
  const tr = (locale: string) => s.content.find((c) => c.locale === locale);
  const name = (a?: { name: string }, b?: { name: string }) => (a?.name.trim() || b?.name.trim() || "");
  const my = tr("my");
  const en = tr("en");
  const canonical = {
    c: s.categoryId,
    b: s.brandId,
    t: [
      ["en", name(en, my), (en?.description ?? "").trim()],
      ["my", name(my, en), (my?.description ?? "").trim()],
    ],
    v: s.variants
      .map((v) => [
        v.sku,
        v.label,
        v.priceMmk,
        v.active,
        !!v.isBundle,
        [...(v.components ?? [])].map((c) => `${c.componentId}×${c.qty}`).sort(),
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    i: [...s.images].sort(),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 32);
}

export const APPROVAL_STATUSES = ["DRAFT", "PENDING", "REJECTED", "APPROVED"] as const;
export type ApprovalStatusValue = (typeof APPROVAL_STATUSES)[number];

/** Nhãn chính (một nhãn) hiển thị cho người dùng. "Đã ẩn" gồm cả SP đã duyệt nhưng chưa từng đăng. */
export const PRODUCT_LABELS = ["DRAFT", "PENDING", "REJECTED", "PUBLISHED", "HIDDEN", "ARCHIVED"] as const;
export type ProductLabel = (typeof PRODUCT_LABELS)[number];
/** Nhãn phụ của SP đã duyệt có bản đang sửa: nháp / chờ duyệt / bị từ chối. */
export type ChangeLabel = "DRAFT" | "PENDING" | "REJECTED";

export type LabelInput = {
  archivedAt: Date | null;
  published: boolean;
  approvedAt: Date | null;
  approvalStatus: ApprovalStatusValue;
  /** Có bản đang sửa (ProductChangeRequest). */
  hasChanges: boolean;
};

export function deriveLabel(p: LabelInput): { label: ProductLabel; change: ChangeLabel | null } {
  const change: ChangeLabel | null =
    p.approvedAt && p.hasChanges ? (p.approvalStatus === "APPROVED" ? "DRAFT" : p.approvalStatus) : null;
  if (p.archivedAt) return { label: "ARCHIVED", change };
  if (p.published) return { label: "PUBLISHED", change };
  if (p.approvedAt) return { label: "HIDDEN", change };
  if (p.approvalStatus === "PENDING") return { label: "PENDING", change: null };
  if (p.approvalStatus === "REJECTED") return { label: "REJECTED", change: null };
  return { label: "DRAFT", change: null };
}

/** Điều kiện truy vấn (Prisma `where`) đúng với `deriveLabel` — dùng lọc danh sách / đếm dashboard. */
export function labelWhere(label: ProductLabel) {
  switch (label) {
    case "ARCHIVED":
      return { archivedAt: { not: null } };
    case "PUBLISHED":
      return { archivedAt: null, published: true };
    case "HIDDEN":
      return { archivedAt: null, published: false, approvedAt: { not: null } };
    case "PENDING":
      return { archivedAt: null, published: false, approvedAt: null, approvalStatus: "PENDING" as const };
    case "REJECTED":
      return { archivedAt: null, published: false, approvedAt: null, approvalStatus: "REJECTED" as const };
    case "DRAFT":
      return { archivedAt: null, published: false, approvedAt: null, approvalStatus: { in: ["DRAFT", "APPROVED"] as ApprovalStatusValue[] } };
  }
}

/** Hàng đợi "Chờ duyệt": SP mới gửi duyệt + bản đang sửa đã gửi duyệt (chưa ngừng KD). */
export const AWAITING_REVIEW_WHERE = { archivedAt: null, approvalStatus: "PENDING" as const };
