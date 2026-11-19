import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { productName } from "@/server/inventory/queries";
import { changeRequestsFor, type StagedPrice } from "@/server/catalog/change-request";
import { loadProductPricing, type VariantPricingRow } from "@/server/catalog/product-pricing";

/**
 * Trang Giá bán (P3b): bảng tổng hợp mọi SKU của SP chưa ngừng KD — giá đang bán, giá chờ duyệt
 * (bản đang sửa), giá mua gần nhất, nguồn giá. Chỉ đọc; ghi giá qua bảng tính (`applyRun`), thủ công kho VND
 * (`applyManualVnd`) hoặc kho MMK (`saveProductPricing`) — xem docs/ban-do-nghiep-vu-admin.md.
 */
export const SELLING_STATES = ["zero", "pending", "stale"] as const;
export type SellingState = (typeof SELLING_STATES)[number];
export const SELLING_PAGE_SIZES = [20, 50, 100] as const;

const BASE: Prisma.VariantWhereInput = { product: { archivedAt: null } };

/** Biến thể có giá chờ duyệt (khoá trong `ProductChangeRequest.prices`). Số bản đang sửa nhỏ → đọc hết. */
async function pendingPrices() {
  // Như `effectivePricingOf`: giá chờ duyệt chỉ có nghĩa với SP đã duyệt.
  const rows = await prisma.productChangeRequest.findMany({ where: { product: { archivedAt: null, approvedAt: { not: null } } }, select: { prices: true } });
  const out = new Map<string, StagedPrice>();
  for (const r of rows) for (const [id, p] of Object.entries((r.prices as Record<string, StagedPrice> | null) ?? {})) out.set(id, p);
  return out;
}

/**
 * Cùng quy tắc cảnh báo `PRICE_STALE` (readiness): SKU đang bật, giá > 0, đã có lịch sử giá, và có phiếu NHẬP ghi sổ
 * HOẶC lần đổi giá mua (`Variant.purchasePriceAt`, 19/11/2026) (combo: của bất kỳ thành phần nào) sau lần đổi giá gần nhất. Chỉ tính lần nhập hợp lệ làm nguồn giá
 * (`receiptSourceLine` + đúng kho — A1 16/11).
 */
async function staleVariantIds(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH rcv AS (
      SELECT l."variantId", MAX(d."postedAt") AS at
      FROM "StockDocumentLine" l JOIN "StockDocument" d ON d.id = l."documentId"
      JOIN "Location" t ON t.id = d."toId"
      JOIN "Variant" lv ON lv.id = l."variantId" JOIN "Product" lp ON lp.id = lv."productId"
      WHERE d.type = 'RECEIVE' AND d.status = 'POSTED' AND l.qty > 0 AND l."stockType" = 'SELLABLE'
        AND t.type <> 'QUARANTINE' AND (NOT t.sellable OR t.id = lp."stockLocationId")
      GROUP BY 1),
    -- Mốc giá mua = lần nhập hợp lệ mới nhất hoặc lần đổi giá mua (sửa tay / Excel), cái nào sau.
    buy AS (
      SELECT v.id AS "variantId", GREATEST((SELECT rcv.at FROM rcv WHERE rcv."variantId" = v.id), v."purchasePriceAt") AS at
      FROM "Variant" v),
    chg AS (
      -- Lần đặt giá gần nhất: lịch sử giá, hoặc giá đang chờ duyệt (đặt sau khi có phiếu nhập → không còn "cũ").
      SELECT "variantId", MAX(at) AS at FROM (
        SELECT "variantId", "createdAt" AS at FROM "PriceHistory"
        UNION ALL
        SELECT e.key AS "variantId", ((e.value->>'stagedAt')::timestamptz AT TIME ZONE 'UTC') AS at
        FROM "ProductChangeRequest" cr, jsonb_each(cr.prices) e
        WHERE cr.prices IS NOT NULL AND jsonb_typeof(cr.prices) = 'object' AND e.value ? 'stagedAt'
      ) x GROUP BY 1)
    SELECT v.id FROM "Variant" v
    JOIN "Product" p ON p.id = v."productId"
    JOIN chg ON chg."variantId" = v.id
    WHERE p."archivedAt" IS NULL AND v.active AND v."priceMmk" > 0
      AND (CASE WHEN v."isBundle"
            THEN (SELECT MAX(buy.at) FROM "BundleItem" b JOIN buy ON buy."variantId" = b."componentId" WHERE b."bundleId" = v.id)
            ELSE (SELECT buy.at FROM buy WHERE buy."variantId" = v.id) END) > chg.at`;
  return rows.map((r) => r.id);
}

export async function sellingPriceStats() {
  const [total, zero, pending, stale] = await Promise.all([
    prisma.variant.count({ where: BASE }),
    prisma.variant.count({ where: { ...BASE, active: true, priceMmk: { lte: 0 } } }),
    pendingPrices(),
    staleVariantIds(),
  ]);
  return { total, zero, pending: pending.size, stale: stale.length };
}

export async function sellingPriceWarehouses() {
  return prisma.location.findMany({ where: { sellable: true, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
}

export type SellingPriceRow = {
  id: string;
  sku: string;
  label: string;
  active: boolean;
  isBundle: boolean;
  priceMmk: number;
  /** Giá chờ duyệt (bản đang sửa) — null nếu không có. */
  pendingMmk: number | null;
  /** Giá hiệu lực để so xung đột khi lưu: giá chờ duyệt nếu có, không thì giá đang bán (§6.4). */
  effectiveMmk: number;
  /** Hoa hồng CTV cố định đang áp dụng (null = theo % CTV) và đang chờ duyệt (undefined = không đổi). */
  commissionMmk: number | null;
  pendingCommission: number | null | undefined;
  pricingMode: "VN_IMPORT" | "LOCAL_MMK";
  productId: string;
  productName: string;
  image: string | null;
  warehouse: string | null;
  pricing: VariantPricingRow | undefined;
  stale: boolean;
};

export async function listSellingPrices(f: { q: string; warehouseId?: string; state?: SellingState; page: number; size: number }) {
  const [pending, stale] = await Promise.all([pendingPrices(), staleVariantIds()]);
  const where: Prisma.VariantWhereInput = {
    product: { archivedAt: null, ...(f.warehouseId && { stockLocationId: f.warehouseId }) },
    ...(f.q && {
      OR: [
        { sku: { contains: f.q, mode: "insensitive" } },
        { label: { contains: f.q, mode: "insensitive" } },
        { product: { translations: { some: { name: { contains: f.q, mode: "insensitive" } } } } },
      ],
    }),
    ...(f.state === "zero" && { active: true, priceMmk: { lte: 0 } }),
    ...(f.state === "pending" && { id: { in: [...pending.keys()] } }),
    ...(f.state === "stale" && { id: { in: stale } }),
  };
  const total = await prisma.variant.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / f.size));
  const page = Math.min(Math.max(1, f.page), pageCount);
  const variants = await prisma.variant.findMany({
    where,
    orderBy: [{ sku: "asc" }, { id: "asc" }],
    skip: (page - 1) * f.size,
    take: f.size,
    select: {
      id: true,
      sku: true,
      label: true,
      active: true,
      isBundle: true,
      priceMmk: true,
      affiliateCommissionMmk: true,
      productId: true,
      product: {
        select: {
          slug: true,
          translations: { select: { locale: true, name: true } },
          stockLocation: { select: { name: true, pricingMode: true } },
          images: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], take: 1, select: { file: { select: { url: true } } } },
        },
      },
    },
  });
  // Nguồn giá + giá mua gần nhất theo loại tiền của kho bán (VND với kho nhập VN, MMK với kho mua tại chỗ).
  const byMode = (mode: "VN_IMPORT" | "LOCAL_MMK") => variants.filter((v) => (v.product.stockLocation?.pricingMode ?? "VN_IMPORT") === mode).map((v) => v.id);
  const [vn, mmk] = await Promise.all([loadProductPricing(byMode("VN_IMPORT"), "VN_IMPORT"), loadProductPricing(byMode("LOCAL_MMK"), "LOCAL_MMK")]);
  const staleSet = new Set(stale);
  const rows: SellingPriceRow[] = variants.map((v) => {
    const sp = pending.get(v.id);
    // Bản chờ duyệt chỉ đổi hoa hồng vẫn lưu `priceMmk` = giá đang bán → không hiện "giá chờ duyệt" trùng giá cũ.
    const p = sp && sp.priceMmk !== v.priceMmk ? sp.priceMmk : null;
    return {
      id: v.id,
      sku: v.sku,
      label: v.label,
      active: v.active,
      isBundle: v.isBundle,
      priceMmk: v.priceMmk,
      pendingMmk: p,
      effectiveMmk: p ?? v.priceMmk,
      commissionMmk: v.affiliateCommissionMmk,
      pendingCommission: sp?.commission ? sp.commission.value : undefined,
      pricingMode: v.product.stockLocation?.pricingMode ?? "VN_IMPORT",
      productId: v.productId,
      productName: productName(v.product.translations, v.product.slug),
      image: v.product.images[0]?.file.url ?? null,
      warehouse: v.product.stockLocation?.name ?? null,
      pricing: vn.get(v.id) ?? mmk.get(v.id),
      stale: staleSet.has(v.id),
    };
  });
  return { rows, total, page, pageCount };
}

/** Dùng cho test: giá hiệu lực của một biến thể (để kiểm form gửi đúng `expectedPriceMmk`). */
export async function effectiveSellingPrice(variantId: string) {
  const v = await prisma.variant.findUniqueOrThrow({ where: { id: variantId }, select: { priceMmk: true, productId: true } });
  const cr = (await changeRequestsFor(prisma, [v.productId])).get(v.productId);
  return cr?.prices[variantId]?.priceMmk ?? v.priceMmk;
}
