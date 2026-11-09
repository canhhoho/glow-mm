import { createHash } from "node:crypto";

/**
 * QT2 — bước 4 Duyệt (thuần, không DB → unit test). Dấu vân tay những gì khách thấy và người duyệt đã xem:
 * tên + mô tả (my, en), danh mục, thương hiệu, biến thể (SKU, nhãn, giá, đang bán, khối lượng), ảnh (thứ tự).
 * Không gồm: alt ảnh, tag, ghi chú bảo quản, ngưỡng tồn, kho bán, trạng thái hiển thị.
 */
export type ApprovalSnapshot = {
  categoryId: string;
  brandId: string;
  content: { locale: string; name: string; description: string | null }[];
  variants: { sku: string; label: string; priceMmk: number; active: boolean; weightGrams: number | null }[];
  /** fileId theo sortOrder. */
  images: string[];
};

export function approvalHash(s: ApprovalSnapshot): string {
  const canonical = {
    c: s.categoryId,
    b: s.brandId,
    t: s.content
      .filter((c) => c.locale === "my" || c.locale === "en")
      .map((c) => [c.locale, c.name.trim(), (c.description ?? "").trim()])
      .sort((a, b) => a[0].localeCompare(b[0])),
    v: s.variants.map((v) => [v.sku, v.label, v.priceMmk, v.active, v.weightGrams ?? null]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    i: s.images,
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 32);
}

/**
 * PENDING = chưa từng duyệt · APPROVED = đã duyệt (kể cả bản chuyển đổi do hệ thống) · STALE = đã sửa sau khi duyệt, cần duyệt lại.
 * Khi nội dung đổi, `approvedAt` bị xoá nhưng giữ `approvedHash` → phân biệt STALE với PENDING.
 */
export type ApprovalState = "PENDING" | "APPROVED" | "STALE";
export function approvalState(p: { approvedAt: Date | null; approvedHash: string | null }): ApprovalState {
  if (p.approvedAt) return "APPROVED";
  return p.approvedHash ? "STALE" : "PENDING";
}
