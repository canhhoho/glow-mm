import "server-only";
import { z } from "zod";
import { rawId } from "@/lib/schemas";
import { prisma } from "@/lib/db";
import { variantCosts, type CostSource } from "@/server/pricing/cost";
import { CatalogError, lockCatalog } from "./products";
import { effectivePricing, stagePrices } from "./change-request";
import { guardApproval } from "./approval";
import { commissionOverPrice, writeLivePrice } from "./price-write";

/**
 * Bước 3 "Giá bán" trên trang SP (QT1b, docs/ke-hoach-quy-trinh-san-pham.md):
 * Dùng chung cho bước 3 trên trang SP và bảng nhập tay Giá bán.
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
        expectedPriceMmk: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
        /** Bỏ qua (undefined) = giữ nguyên; "" = theo % của CTV. */
        affiliateCommissionMmk: optionalMoney.optional(),
      }),
    )
    .min(1)
    .max(200),
});

export const MANUAL_PRICE_PREFIX = "manual: ";
/** Giá đổi qua Excel: `"import:<8 ký tự đầu sha256 của file>"` (P0-C2); bản cũ ghi `"import"`. */
export const IMPORT_PRICE_PREFIX = "import:";

export async function saveProductPricing(raw: unknown, userId: string) {
  const input = productPricingSchema.parse(raw);
  return prisma.$transaction(async (tx) => guardApproval(tx, [input.productId], userId, async () => {
    await lockCatalog(tx);
    await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${input.productId} FOR UPDATE`;
    const product = await tx.product.findUnique({
      where: { id: input.productId },
      select: { id: true, fixedProfitMmk: true, approvedAt: true, variants: { select: { id: true, sku: true, priceMmk: true, affiliateCommissionMmk: true } } },
    });
    if (!product) throw new CatalogError("Không tìm thấy sản phẩm");
    // P1-A + 16/11: SP đã duyệt → giá VÀ hoa hồng CTV vào bản đang sửa, có hiệu lực cùng lúc khi duyệt (khách vẫn thấy
    // bản đã duyệt); so xung đột theo giá trị hiệu lực. SP chưa duyệt → ghi thẳng cả hai cùng lúc.
    const staged = product.approvedAt != null;
    const effective = staged
      ? await effectivePricing(tx, product.id)
      : new Map(product.variants.map((v) => [v.id, { priceMmk: v.priceMmk, commission: v.affiliateCommissionMmk }]));
    const reason = `${MANUAL_PRICE_PREFIX}${input.reason}`;
    const plan = input.variants.map((entry) => {
      const live = product.variants.find((v) => v.id === entry.id);
      if (!live) throw new CatalogError("Phân loại không thuộc sản phẩm này");
      const cur = effective.get(live.id)!;
      if (entry.expectedPriceMmk !== undefined && cur.priceMmk !== entry.expectedPriceMmk) throw new CatalogError(`Giá của ${live.sku} vừa được đổi ở nơi khác — tải lại trang`);
      const commission = entry.affiliateCommissionMmk === undefined ? cur.commission : entry.affiliateCommissionMmk;
      if (commissionOverPrice(entry.priceMmk, commission)) throw new CatalogError(`Hoa hồng CTV của ${live.sku} lớn hơn giá bán`);
      return { live, cur, priceMmk: entry.priceMmk, commission, priceChanged: cur.priceMmk !== entry.priceMmk, commissionChanged: cur.commission !== commission };
    });
    if (plan.some((p) => p.priceChanged) && !input.reason) throw new CatalogError("Nhập lý do sửa giá");

    const changes: { sku: string; price?: [number, number]; commission?: [number | null, number | null] }[] = [];
    for (const p of plan) {
      if (!p.priceChanged && !p.commissionChanged) continue;
      if (!staged) {
        // Khoá theo giá + hoa hồng đang đọc: bảng tính giá áp xen giữa → báo lỗi thay vì ghi đè.
        const ok = await writeLivePrice(tx, {
          variantId: p.live.id,
          from: { priceMmk: p.live.priceMmk, commission: p.live.affiliateCommissionMmk },
          to: { priceMmk: p.priceMmk, commission: p.commission },
          reason,
          userId,
        });
        if (!ok) throw new CatalogError(`Giá của ${p.live.sku} vừa được đổi ở nơi khác — tải lại trang`);
      }
      changes.push({
        sku: p.live.sku,
        ...(p.priceChanged && { price: [p.cur.priceMmk, p.priceMmk] as [number, number] }),
        ...(p.commissionChanged && { commission: [p.cur.commission, p.commission] as [number | null, number | null] }),
      });
    }
    if (staged) {
      await stagePrices(
        tx,
        product.id,
        plan.filter((p) => p.priceChanged || p.commissionChanged).map((p) => ({ variantId: p.live.id, priceMmk: p.priceMmk, commission: p.commission, reason })),
        userId,
      );
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
  }));
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
  cost: { amount: number; currency: "VND" | "MMK"; source?: CostSource; /** Giá mua hiện tại của phân loại (không phải một lần nhập). */ purchase: boolean } | null;
  /** Phiếu NHẬP nháp mới nhất có SKU này: giá mua trong đó chưa được tính đến khi ghi sổ. */
  draft: { documentId: string; code: string } | null;
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
      select: { variantId: true, runId: true, reason: true, createdAt: true, run: { select: { mode: true } } },
    }),
    variantCosts(prisma, variantIds, currency, currency === "VND" ? "PURCHASE" : "LANDED"),
  ]);
  const drafts = await prisma.stockDocumentLine.findMany({
    where: { variantId: { in: variantIds }, document: { type: "RECEIVE", status: "DRAFT" } },
    orderBy: [{ document: { createdAt: "desc" } }, { id: "desc" }],
    select: { variantId: true, document: { select: { id: true, code: true } } },
  });
  const draftOf = new Map<string, { documentId: string; code: string }>();
  for (const d of drafts) if (!draftOf.has(d.variantId)) draftOf.set(d.variantId, { documentId: d.document.id, code: d.document.code });
  const last = new Map(history.map((h) => [h.variantId, h]));
  return new Map(
    variantIds.map((id) => {
      const h = last.get(id);
      // Lần đặt giá thủ công (run MANUAL của trang Giá bán) là "Sửa tay", không phải bảng tính giá tự động.
      const source: PriceSource = !h
        ? { kind: "none" }
        : h.runId && h.run?.mode !== "MANUAL"
          ? { kind: "run", runId: h.runId, at: h.createdAt }
          : h.reason === "import" || h.reason?.startsWith(IMPORT_PRICE_PREFIX)
            ? { kind: "import", at: h.createdAt }
            : { kind: "manual", note: h.reason?.startsWith(MANUAL_PRICE_PREFIX) ? h.reason.slice(MANUAL_PRICE_PREFIX.length) : "", at: h.createdAt };
      const c = costs.get(id);
      return [id, { id, source, cost: c ? { amount: c.costVnd, currency, source: c.source, purchase: !!c.purchase } : null, draft: draftOf.get(id) ?? null }];
    }),
  );
}
