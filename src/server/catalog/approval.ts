import "server-only";
import type { Tx } from "@/server/inventory/ledger";
import { approvalHash, type ApprovalSnapshot } from "./approval-rules";
import { CatalogError } from "./products";

/**
 * Dấu vân tay phần CẦN DUYỆT của SP (P1-A) + lưới an toàn cho mọi đường ghi. Quy trình gửi/duyệt/từ chối ở `review.ts`,
 * bản đang sửa của SP đã duyệt ở `change-request.ts`.
 */

export async function approvalHashes(db: Tx, productIds: string[]): Promise<Map<string, string>> {
  if (productIds.length === 0) return new Map();
  const rows = await db.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      categoryId: true,
      brandId: true,
      translations: { select: { locale: true, name: true, description: true } },
      variants: { select: { sku: true, label: true, priceMmk: true, active: true, isBundle: true, bundleItems: { select: { componentId: true, qty: true } } } },
      images: { select: { fileId: true } },
    },
  });
  return new Map(
    rows.map((p) => {
      const snapshot: ApprovalSnapshot = {
        categoryId: p.categoryId,
        brandId: p.brandId,
        content: p.translations,
        variants: p.variants.map((v) => ({ sku: v.sku, label: v.label, priceMmk: v.priceMmk, active: v.active, isBundle: v.isBundle, components: v.bundleItems })),
        images: p.images.map((i) => i.fileId),
      };
      return [p.id, approvalHash(snapshot)];
    }),
  );
}

/** Ảnh chụp hoa hồng CTV cố định của các SP (chuỗi so sánh được). */
async function commissionsOf(tx: Tx, productIds: string[]): Promise<string> {
  if (productIds.length === 0) return "";
  const rows = await tx.variant.findMany({ where: { productId: { in: productIds } }, select: { id: true, affiliateCommissionMmk: true }, orderBy: { id: "asc" } });
  return rows.map((v) => `${v.id}:${v.affiliateCommissionMmk ?? ""}`).join(",");
}

/**
 * Chạy `fn` (trong `tx`) và theo dõi phần cần duyệt của các SP:
 * - SP chưa từng duyệt mà phần cần duyệt đổi → phiên bản +1; đang chờ duyệt → về nháp (rời hàng đợi, người duyệt
 *   không thể duyệt bản chưa xem); bị từ chối giữ nguyên cho đến khi gửi lại.
 * - SP đã duyệt: phần cần duyệt KHÔNG được đổi trực tiếp (phải qua bản đang sửa) → lỗi, trừ khi đang áp bản đã duyệt.
 */
export async function guardApproval<T>(tx: Tx, productIds: string[], userId: string, fn: () => Promise<T>, opts: { applying?: boolean } = {}): Promise<T> {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (ids.length === 0) return fn();
  const products = await tx.product.findMany({ where: { id: { in: ids } }, select: { id: true, approvedAt: true, approvalStatus: true } });
  if (products.length === 0) return fn();
  const approved = products.filter((p) => p.approvedAt).map((p) => p.id);
  const before = await approvalHashes(tx, products.map((p) => p.id));
  const commissionBefore = await commissionsOf(tx, approved);
  const result = await fn();
  const after = await approvalHashes(tx, products.map((p) => p.id));
  // 16/11: hoa hồng CTV cố định của SP đã duyệt có hiệu lực cùng giá → chỉ đổi qua bản đang sửa (không nằm trong dấu
  // vân tay để SP cũ không bị coi là "có thay đổi"; kiểm riêng ở đây).
  if (!opts.applying && approved.length && (await commissionsOf(tx, approved)) !== commissionBefore) {
    throw new CatalogError("Hoa hồng CTV của sản phẩm đã duyệt phải đổi cùng giá qua bản đang sửa (trang Giá bán)");
  }
  for (const p of products) {
    if (before.get(p.id) === after.get(p.id)) continue;
    if (p.approvedAt) {
      if (opts.applying) continue;
      throw new CatalogError("Thay đổi cần duyệt của sản phẩm đã duyệt phải đi qua bản đang sửa");
    }
    await tx.product.update({
      where: { id: p.id },
      data: {
        approvalVersion: { increment: 1 },
        ...(p.approvalStatus === "PENDING" && { approvalStatus: "DRAFT", submittedAt: null, submittedById: null }),
      },
    });
    if (p.approvalStatus === "PENDING") await tx.auditLog.create({ data: { userId, action: "product.submit_withdrawn", entity: "Product", entityId: p.id } });
  }
  return result;
}
