import "server-only";
import { isStandardVariantLabel } from "@/lib/variant-label";
import { prisma } from "@/lib/db";
import { productName } from "@/server/inventory/queries";
import { getNumberSetting } from "@/server/settings";
import { receiptSources, variantCosts } from "./cost";
import { rateDisplay } from "./formula";
import { latestRate } from "./latest-rate";
import { lastShipRate, listRates } from "./queries";
import { effectivePricingOf } from "@/server/catalog/change-request";

/**
 * Dữ liệu trang Giá bán — chế độ THỦ CÔNG (16/11). Gom theo kho bán:
 *  - kho hàng nhập VN: bảng (giá mua NCC của lần nhập chọn + lãi VND) ÷ tỷ giá + vận chuyển + CTV;
 *  - kho mua MMK: giữ nghiệp vụ cũ (giá nhập thẳng + hoa hồng + lãi cố định).
 * Chỉ đọc. Số tiền là số nguyên; tỷ giá trả về dạng chuỗi để client tính chính xác bằng `formula.ts`.
 */

export type ManualSource = { lineId: string; lotNo: string; documentCode: string; postedAt: string | null; unitCostVnd: number | null; unitCostMmk: number | null; qty: number };
export type ManualRow = {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  label: string;
  /** Nhãn hệ thống "một loại tiêu chuẩn" — giao diện không hiện như tên phân loại (tính ở server: client không tải bảng chuỗi). */
  standardLabel: boolean;
  active: boolean;
  isBundle: boolean;
  livePrice: number;
  liveCommission: number | null;
  /** Giá / hoa hồng hiệu lực (đang chờ duyệt nếu có) — gửi kèm để chống ghi đè đồng thời. */
  price: number;
  commission: number | null;
  pending: boolean;
  /** Các lần nhập hợp lệ làm cơ sở (mới nhất trước). Combo: trống, dùng `comboCostVnd`. */
  sources: ManualSource[];
  comboCostVnd: number | null;
  /** Lần thủ công gần nhất của SKU (gợi ý): lãi VND, vận chuyển MMK. */
  lastProfitVnd: number | null;
  lastShipMmk: number | null;
  /** Gợi ý vận chuyển = cước/kg lần tính gần nhất × khối lượng (làm tròn), khi chưa có lần thủ công. */
  suggestedShipMmk: number | null;
  weightGrams: number | null;
  fixedProfitMmk: number | null;
};
export type ManualGroup = { location: { id: string; code: string; name: string; pricingMode: "VN_IMPORT" | "LOCAL_MMK" }; rows: ManualRow[] };
export type ManualRate = { id: string; mmkPerVnd: string; mmkPerUsd: string | null; vndPerUsd: string | null; vndPerMmk: string; effectiveAt: string; current: boolean };

const MAX_ROWS = 200;

export async function manualPricingView(f: { variantIds?: string[]; productId?: string }) {
  const variants = await prisma.variant.findMany({
    where: {
      product: { archivedAt: null, ...(f.productId && { id: f.productId }) },
      ...(f.variantIds?.length && { id: { in: f.variantIds } }),
      ...(!f.variantIds?.length && !f.productId && { id: "__none__" }),
    },
    orderBy: [{ product: { slug: "asc" } }, { sku: "asc" }],
    take: MAX_ROWS,
    select: {
      id: true,
      sku: true,
      label: true,
      active: true,
      isBundle: true,
      weightGrams: true,
      priceMmk: true,
      affiliateCommissionMmk: true,
      productId: true,
      product: {
        select: {
          slug: true,
          fixedProfitMmk: true,
          translations: { select: { locale: true, name: true } },
          stockLocation: { select: { id: true, code: true, name: true, pricingMode: true } },
        },
      },
      bundleItems: { select: { qty: true, component: { select: { weightGrams: true } } } },
    },
  });
  const ids = variants.map((v) => v.id);
  const [eff, sources, comboCosts, lastManual, ship, rates, current, roundTo] = await Promise.all([
    effectivePricingOf(prisma, ids),
    receiptSources(prisma, ids.filter((id) => !variants.find((v) => v.id === id)!.isBundle)),
    variantCosts(prisma, variants.filter((v) => v.isBundle).map((v) => v.id), "VND", "PURCHASE"),
    prisma.priceRunLine.findMany({
      where: { variantId: { in: ids }, status: "APPLIED", run: { mode: "MANUAL" } },
      orderBy: { appliedAt: "desc" },
      distinct: ["variantId"],
      select: { variantId: true, profitVnd: true, shipMmk: true },
    }),
    lastShipRate(),
    listRates(10),
    latestRate(prisma),
    getNumberSetting("pricing.roundTo"),
  ]);
  const last = new Map(lastManual.map((l) => [l.variantId, l]));
  const groups = new Map<string, ManualGroup>();
  // SP chưa có kho bán (chưa nhập hàng): chưa có cách tính giá (VND hay MMK) → liệt kê riêng, không đặt giá.
  const unplaced: string[] = [];
  for (const v of variants) {
    const loc = v.product.stockLocation;
    if (!loc) {
      unplaced.push(v.sku);
      continue;
    }
    const g = groups.get(loc.id) ?? { location: { id: loc.id, code: loc.code, name: loc.name, pricingMode: loc.pricingMode ?? "VN_IMPORT" }, rows: [] };
    const e = eff.get(v.id)!;
    const weight = v.weightGrams && v.weightGrams > 0 ? v.weightGrams : v.isBundle && v.bundleItems.every((b) => (b.component.weightGrams ?? 0) > 0) ? v.bundleItems.reduce((s, b) => s + b.component.weightGrams! * b.qty, 0) : null;
    g.rows.push({
      variantId: v.id,
      productId: v.productId,
      productName: productName(v.product.translations, v.product.slug),
      sku: v.sku,
      label: v.label,
      standardLabel: isStandardVariantLabel(v.label),
      active: v.active,
      isBundle: v.isBundle,
      livePrice: v.priceMmk,
      liveCommission: v.affiliateCommissionMmk,
      price: e.priceMmk,
      commission: e.commission,
      pending: e.pending,
      sources: (sources.get(v.id) ?? []).map((s) => ({
        lineId: s.lineId,
        lotNo: s.lotNo,
        documentCode: s.documentCode,
        postedAt: s.postedAt?.toISOString() ?? null,
        unitCostVnd: s.unitCostVnd,
        unitCostMmk: s.unitCostMmk,
        qty: s.qty,
      })),
      comboCostVnd: comboCosts.get(v.id)?.costVnd ?? null,
      lastProfitVnd: last.get(v.id)?.profitVnd ?? null,
      lastShipMmk: last.get(v.id)?.shipMmk ?? null,
      suggestedShipMmk: ship != null && weight ? Math.round((ship * weight) / 1000) : null,
      weightGrams: weight,
      fixedProfitMmk: v.product.fixedProfitMmk,
    });
    groups.set(loc.id, g);
  }
  const rateRows: ManualRate[] = rates
    .filter((r) => r.effectiveAt <= new Date())
    .map((r) => ({
      id: r.id,
      mmkPerVnd: r.mmkPerVnd.toString(),
      mmkPerUsd: r.mmkPerUsd?.toString() ?? null,
      vndPerUsd: r.vndPerUsd?.toString() ?? null,
      vndPerMmk: rateDisplay(r).vndPerMmk,
      effectiveAt: r.effectiveAt.toISOString(),
      current: r.id === current?.id,
    }));
  return { groups: [...groups.values()], unplaced, rates: rateRows, currentRateId: current?.id ?? null, roundTo, truncated: variants.length >= MAX_ROWS };
}
