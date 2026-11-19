import "server-only";
import type { Tx } from "@/server/inventory/ledger";
import { isSourceForProduct } from "./cost";

/**
 * Giá mua hiện tại của phân loại (19/11/2026) — MỘT đường ghi cho mọi nơi đổi giá mua:
 *  - trang Giá bán (sửa tay khi đặt giá), nhập Excel (cột Giá mua), và ghi sổ phiếu NHẬP (tự cập nhật theo giá của lần nhập).
 * Tiền theo kho bán của SP: kho nhập VN → `purchasePriceVnd`, kho mua tại Myanmar → `purchasePriceMmk`.
 * Đây là nguồn giá mua mặc định để TÍNH GIÁ BÁN (`variantCosts`); giá vốn vẫn lấy từ lô thật.
 * Mỗi lần đổi ghi `purchasePriceAt` (mốc cảnh báo PRICE_STALE) + một dòng AuditLog (lịch sử).
 */
export type PurchaseCurrency = "VND" | "MMK";
export type PurchaseSource = "manual" | "import" | "receipt";

export class PurchasePriceError extends Error {}

export const currencyOfMode = (mode: string | null | undefined): PurchaseCurrency => (mode === "LOCAL_MMK" ? "MMK" : "VND");

export async function setPurchasePrices(
  tx: Tx,
  entries: { variantId: string; currency: PurchaseCurrency; amount: number }[],
  meta: { userId: string; source: PurchaseSource; at?: Date; ref?: string },
): Promise<number> {
  if (entries.length === 0) return 0;
  const at = meta.at ?? new Date();
  const ids = [...new Set(entries.map((e) => e.variantId))];
  const variants = await tx.variant.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      sku: true,
      isBundle: true,
      purchasePriceVnd: true,
      purchasePriceMmk: true,
      purchasePriceAt: true,
      product: { select: { stockLocation: { select: { pricingMode: true, code: true } } } },
    },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  const changes: { variantId: string; sku: string; currency: PurchaseCurrency; from: number | null; to: number }[] = [];
  for (const e of entries) {
    const v = byId.get(e.variantId);
    if (!v) throw new PurchasePriceError("Phân loại không tồn tại");
    if (v.isBundle) throw new PurchasePriceError(`${v.sku} là combo — giá mua = tổng giá mua thành phần`);
    if (!Number.isInteger(e.amount) || e.amount < 0) throw new PurchasePriceError(`${v.sku}: giá mua phải là số nguyên ≥ 0`);
    const loc = v.product.stockLocation;
    // Tay / Excel: tiền phải đúng kho bán (VND kho nhập VN, MMK kho Myanmar). Phiếu nhập: tiền theo lô (đã kiểm khi lập phiếu).
    if (meta.source !== "receipt") {
      if (!loc) throw new PurchasePriceError(`${v.sku}: chưa có kho bán — gán kho trước để biết giá mua theo VND hay MMK`);
      if (currencyOfMode(loc.pricingMode) !== e.currency) {
        throw new PurchasePriceError(`${v.sku}: kho ${loc.code} nhập giá mua ${currencyOfMode(loc.pricingMode)}, không nhận ${e.currency}`);
      }
    }
    // Lần nhập cũ hơn lần đổi giá gần nhất (ghi sổ phiếu cũ sau khi đã sửa tay) → không ghi đè giá mới hơn.
    if (meta.source === "receipt" && v.purchasePriceAt && v.purchasePriceAt > at) continue;
    const from = e.currency === "VND" ? v.purchasePriceVnd : v.purchasePriceMmk;
    if (from === e.amount) {
      if (meta.source === "receipt" && (!v.purchasePriceAt || v.purchasePriceAt < at)) {
        await tx.variant.update({ where: { id: v.id }, data: { purchasePriceAt: at } });
      }
      continue;
    }
    await tx.variant.update({
      where: { id: v.id },
      data: { ...(e.currency === "VND" ? { purchasePriceVnd: e.amount } : { purchasePriceMmk: e.amount }), purchasePriceAt: at },
    });
    changes.push({ variantId: v.id, sku: v.sku, currency: e.currency, from, to: e.amount });
  }
  if (changes.length) {
    await tx.auditLog.create({
      data: { userId: meta.userId, action: "variant.purchase_price", entity: "Variant", entityId: changes.length === 1 ? changes[0].variantId : null, data: { source: meta.source, ref: meta.ref ?? null, changes: changes.map((c) => ({ sku: c.sku, currency: c.currency, from: c.from, to: c.to })) } },
    });
  }
  return changes.length;
}

/**
 * Ghi sổ phiếu NHẬP → giá mua hiện tại của phân loại = giá của lần nhập này (phương án A, 19/11/2026).
 * Cùng điều kiện "nguồn giá mua" với `receiptSourceLine`: SL dương, hàng bán được, không vào khu chờ kiểm tra,
 * vào đúng kho bán của SP (hoặc kho chưa bán). Nhiều dòng cùng phân loại → dòng sau cùng.
 */
export async function syncPurchasePricesFromReceipt(tx: Tx, documentId: string, userId: string): Promise<number> {
  const doc = await tx.stockDocument.findUnique({
    where: { id: documentId },
    select: {
      code: true,
      type: true,
      status: true,
      postedAt: true,
      to: { select: { id: true, sellable: true, type: true } },
      lines: {
        where: { qty: { gt: 0 }, stockType: "SELLABLE" },
        orderBy: { id: "asc" },
        select: { variantId: true, unitCostVnd: true, unitCostMmk: true, variant: { select: { isBundle: true, product: { select: { stockLocationId: true } } } } },
      },
    },
  });
  if (!doc || doc.type !== "RECEIVE" || doc.status !== "POSTED" || !doc.postedAt || !doc.to || doc.to.type === "QUARANTINE") return 0;
  const latest = new Map<string, { variantId: string; currency: PurchaseCurrency; amount: number }>();
  for (const l of doc.lines) {
    if (l.variant.isBundle || !isSourceForProduct(doc.to, l.variant.product.stockLocationId)) continue;
    if (l.unitCostVnd != null) latest.set(l.variantId, { variantId: l.variantId, currency: "VND", amount: l.unitCostVnd });
    else if (l.unitCostMmk != null) latest.set(l.variantId, { variantId: l.variantId, currency: "MMK", amount: l.unitCostMmk });
  }
  return setPurchasePrices(tx, [...latest.values()], { userId, source: "receipt", at: doc.postedAt, ref: doc.code });
}
