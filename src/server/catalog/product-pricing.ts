import "server-only";
import { z } from "zod";
import { rawId } from "@/lib/schemas";
import { prisma } from "@/lib/db";
import { variantCosts, type CostSource } from "@/server/pricing/cost";
import { CatalogError } from "./products";

/**
 * Bước 3 "Giá bán" trên trang SP (QT1b, docs/ke-hoach-quy-trinh-san-pham.md):
 * nơi duy nhất sửa tay giá / hoa hồng CTV cố định / lãi cố định MMK của một SP (ngoài bảng tính giá và Excel SKU có sẵn).
 * Đổi giá bắt buộc lý do → `PriceHistory.reason = "manual: <lý do>"`. Giá phải > 0.
 */

const optionalMoney = z.preprocess(
  (v) => (v === "" ? null : v),
  z.coerce.number().int().min(0).max(1_000_000_000).nullable(),
);

export const productPricingSchema = z.object({
  productId: rawId,
  reason: z.string().trim().max(200).default(""),
  /** Bỏ qua (undefined) = giữ nguyên; chỉ dùng cho kho mua tại Myanmar (LOCAL_MMK). */
  fixedProfitMmk: optionalMoney.optional(),
  variants: z
    .array(
      z.object({
        id: rawId,
        priceMmk: z.coerce.number().int().min(1, "Giá bán phải lớn hơn 0").max(1_000_000_000),
        /** Bỏ qua (undefined) = giữ nguyên; "" = theo % của CTV. */
        affiliateCommissionMmk: optionalMoney.optional(),
      }),
    )
    .min(1)
    .max(200),
});

export const MANUAL_PRICE_PREFIX = "manual: ";

export async function saveProductPricing(raw: unknown, userId: string) {
  const input = productPricingSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${input.productId} FOR UPDATE`;
    const product = await tx.product.findUnique({
      where: { id: input.productId },
      select: { id: true, fixedProfitMmk: true, variants: { select: { id: true, sku: true, priceMmk: true, affiliateCommissionMmk: true } } },
    });
    if (!product) throw new CatalogError("Không tìm thấy sản phẩm");
    const current = new Map(product.variants.map((v) => [v.id, v]));
    const priceChanges = input.variants.filter((v) => {
      const cur = current.get(v.id);
      if (!cur) throw new CatalogError("Biến thể không thuộc sản phẩm này");
      return cur.priceMmk !== v.priceMmk;
    });
    if (priceChanges.length && !input.reason) throw new CatalogError("Nhập lý do sửa giá");

    const changes: { sku: string; price?: [number, number]; commission?: [number | null, number | null] }[] = [];
    for (const entry of input.variants) {
      const cur = current.get(entry.id)!;
      const v = { ...entry, affiliateCommissionMmk: entry.affiliateCommissionMmk === undefined ? cur.affiliateCommissionMmk : entry.affiliateCommissionMmk };
      if (v.affiliateCommissionMmk != null && v.affiliateCommissionMmk > v.priceMmk) throw new CatalogError(`Hoa hồng CTV của ${cur.sku} lớn hơn giá bán`);
      const priceChanged = cur.priceMmk !== v.priceMmk;
      const commissionChanged = cur.affiliateCommissionMmk !== v.affiliateCommissionMmk;
      if (!priceChanged && !commissionChanged) continue;
      // Khoá theo giá đang đọc: bảng tính giá áp xen giữa → báo lỗi thay vì ghi đè.
      const res = await tx.variant.updateMany({
        where: { id: v.id, priceMmk: cur.priceMmk },
        data: { priceMmk: v.priceMmk, affiliateCommissionMmk: v.affiliateCommissionMmk },
      });
      if (res.count !== 1) throw new CatalogError(`Giá của ${cur.sku} vừa được đổi ở nơi khác — tải lại trang`);
      if (priceChanged) {
        await tx.priceHistory.create({
          data: { variantId: v.id, oldPriceMmk: cur.priceMmk, newPriceMmk: v.priceMmk, reason: `${MANUAL_PRICE_PREFIX}${input.reason}`, userId },
        });
      }
      changes.push({
        sku: cur.sku,
        ...(priceChanged && { price: [cur.priceMmk, v.priceMmk] as [number, number] }),
        ...(commissionChanged && { commission: [cur.affiliateCommissionMmk, v.affiliateCommissionMmk] as [number | null, number | null] }),
      });
    }
    const profitChanged = input.fixedProfitMmk !== undefined && input.fixedProfitMmk !== product.fixedProfitMmk;
    if (profitChanged) await tx.product.update({ where: { id: product.id }, data: { fixedProfitMmk: input.fixedProfitMmk } });
    if (changes.length || profitChanged) {
      await tx.auditLog.create({
        data: {
          userId,
          action: "product.pricing",
          entity: "Product",
          entityId: product.id,
          data: { reason: input.reason || null, changes, ...(profitChanged && { fixedProfit: [product.fixedProfitMmk, input.fixedProfitMmk ?? null] }) },
        },
      });
    }
    return { changed: changes.length + (profitChanged ? 1 : 0) };
  });
}

export type PriceSource =
  | { kind: "run"; runId: string; at: Date }
  | { kind: "manual"; note: string; at: Date }
  | { kind: "import"; at: Date }
  | { kind: "none" };

export type VariantPricingRow = {
  id: string;
  source: PriceSource;
  /** Giá mua của phiếu nhập ghi sổ mới nhất (theo loại tiền của kho SP); combo = tổng thành phần. */
  cost: { amount: number; currency: "VND" | "MMK"; source?: CostSource } | null;
};

/** Dữ liệu khối "Giá bán": nguồn giá hiện tại (lần đổi gần nhất) + giá mua gần nhất của từng biến thể. */
export async function loadProductPricing(variantIds: string[], pricingMode: "VN_IMPORT" | "LOCAL_MMK" | null): Promise<Map<string, VariantPricingRow>> {
  if (variantIds.length === 0) return new Map();
  const currency = pricingMode === "LOCAL_MMK" ? "MMK" : "VND";
  const [history, costs] = await Promise.all([
    prisma.priceHistory.findMany({
      where: { variantId: { in: variantIds } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      distinct: ["variantId"],
      select: { variantId: true, runId: true, reason: true, createdAt: true },
    }),
    variantCosts(prisma, variantIds, currency, currency === "VND" ? "PURCHASE" : "LANDED"),
  ]);
  const last = new Map(history.map((h) => [h.variantId, h]));
  return new Map(
    variantIds.map((id) => {
      const h = last.get(id);
      const source: PriceSource = !h
        ? { kind: "none" }
        : h.runId
          ? { kind: "run", runId: h.runId, at: h.createdAt }
          : h.reason === "import"
            ? { kind: "import", at: h.createdAt }
            : { kind: "manual", note: h.reason?.startsWith(MANUAL_PRICE_PREFIX) ? h.reason.slice(MANUAL_PRICE_PREFIX.length) : "", at: h.createdAt };
      const c = costs.get(id);
      return [id, { id, source, cost: c ? { amount: c.costVnd, currency, source: c.source } : null }];
    }),
  );
}
