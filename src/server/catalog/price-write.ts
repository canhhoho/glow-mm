import "server-only";
import type { Tx } from "@/server/inventory/ledger";

/**
 * Ghi giá bán + hoa hồng CTV LIVE của biến thể — một nơi cho mọi đường (R1, docs/ban-do-nghiep-vu-admin.md):
 * Giá bán thủ công MMK (`product-pricing.ts`), bảng tính / thủ công VND (`pricing/runs.ts`), áp bản chờ duyệt
 * (`change-request.ts`), lưu SP / Excel (`products.ts` `writeProduct`). SP đã duyệt không ghi live mà vào bản
 * đang sửa qua `stagePrices` (cùng file `change-request.ts`).
 *
 * `commission` undefined = không đụng tới hoa hồng (không so, không ghi); null = theo % CTV.
 */
export type PricePoint = { priceMmk: number; commission?: number | null };

export type LivePriceChange = {
  variantId: string;
  /** Giới hạn thêm theo SP (áp bản chờ duyệt). */
  productId?: string;
  /** Giá trị live đang đọc — chỉ ghi khi DB vẫn đúng như vậy (khoá lạc quan). */
  from: PricePoint;
  to: PricePoint;
  /** `PriceHistory.reason`: `manual: <lý do>`, `bulk`, `import:<mã file>`… */
  reason: string;
  runId?: string | null;
  userId: string;
  at?: Date;
};

/** Hoa hồng CTV cố định vượt giá bán (chỉ kiểm khi giá > 0 — giá 0 là SKU nháp chưa có giá). */
export const commissionOverPrice = (priceMmk: number, commission: number | null | undefined) =>
  commission != null && priceMmk > 0 && commission > priceMmk;

/**
 * Ghi `PriceHistory` khi GIÁ đổi; kèm hoa hồng cũ/mới nếu hoa hồng cũng đổi. Chỉ đổi hoa hồng → không ghi
 * (đã có trong audit của thao tác).
 */
export async function recordPriceChange(tx: Tx, c: Omit<LivePriceChange, "productId">) {
  if (c.to.priceMmk === c.from.priceMmk) return;
  const commissionChanged = c.from.commission !== undefined && c.to.commission !== undefined && c.from.commission !== c.to.commission;
  await tx.priceHistory.create({
    data: {
      variantId: c.variantId,
      oldPriceMmk: c.from.priceMmk,
      newPriceMmk: c.to.priceMmk,
      ...(commissionChanged && { oldCommissionMmk: c.from.commission, newCommissionMmk: c.to.commission }),
      reason: c.reason,
      runId: c.runId ?? null,
      userId: c.userId,
      ...(c.at && { createdAt: c.at }),
    },
  });
}

/**
 * Ghi giá (+ hoa hồng nếu có) live của một biến thể khi DB vẫn đúng `from`, rồi ghi lịch sử giá.
 * Trả về false nếu giá trị đã bị đổi ở nơi khác (người gọi quyết định báo lỗi hay bỏ qua dòng).
 */
export async function writeLivePrice(tx: Tx, c: LivePriceChange): Promise<boolean> {
  const res = await tx.variant.updateMany({
    where: {
      id: c.variantId,
      ...(c.productId && { productId: c.productId }),
      priceMmk: c.from.priceMmk,
      ...(c.from.commission !== undefined && { affiliateCommissionMmk: c.from.commission }),
    },
    data: { priceMmk: c.to.priceMmk, ...(c.to.commission !== undefined && { affiliateCommissionMmk: c.to.commission }) },
  });
  if (res.count !== 1) return false;
  await recordPriceChange(tx, c);
  return true;
}
