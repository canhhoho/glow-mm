import "server-only";
import { changedBefore, submitTouched } from "@/server/catalog/review";
import { createHash } from "node:crypto";
import { z } from "zod";
import { rawId } from "@/lib/schemas";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getNumberSetting } from "@/server/settings";
import type { Tx } from "@/server/inventory/ledger";
import { variantCosts } from "./cost";
import { guardApproval } from "@/server/catalog/approval";
import { effectivePricingOf, stagePrices } from "@/server/catalog/change-request";
import { commissionOverPrice, recordPriceConfirmation, writeLivePrice } from "@/server/catalog/price-write";
import { lockCatalog } from "@/server/catalog/products";
import { writeAudit } from "@/server/audit";
import { mmkPerVndFromUsd, parseScaled, priceLocalMmk, priceVndManual, priceVnImport, shippingMmk, suggestPrice } from "./formula";

/**
 * Cập nhật giá hàng loạt: nhập tỷ giá → tạo bản XEM TRƯỚC (lưu từng dòng) → chọn dòng → ÁP DỤNG.
 * Áp dụng dùng đúng số đã xem trước; dòng mà giá đã bị sửa sau khi xem trước sẽ bị bỏ qua.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export class PricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PricingError";
  }
}

/** Số thập phân dạng chuỗi (tối đa `decimals` chữ số sau dấu chấm) + điều kiện trên giá trị đã nhân hệ số. */
const decimalString = (decimals: number, check: (scaled: bigint) => boolean, message: string) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => {
      try {
        return check(parseScaled(v, decimals));
      } catch {
        return false;
      }
    }, message);

/** Tỷ giá USD: > 0, tối đa 2 chữ số thập phân (dấu chấm), dưới 1,000 tỷ (Decimal(14,2)); bỏ dấu phẩy/khoảng trắng phân cách nghìn. */
const usdRate = (message: string) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.replace(/[,\s]/g, "") : v),
    decimalString(2, (v) => v > BigInt(0) && v < BigInt(100_000_000_000_000), message),
  );

/** P23: nhập 1 USD = ? MMK và 1 USD = ? VND → hệ thống tự tính MMK cho 1 VND. */
export const rateSchema = z
  .object({
    mmkPerUsd: usdRate("Tỷ giá USD→MMK phải > 0, tối đa 2 chữ số thập phân"),
    vndPerUsd: usdRate("Tỷ giá USD→VND phải > 0, tối đa 2 chữ số thập phân"),
    note: z.string().trim().max(200).optional(),
  })
  // Zod vẫn chạy refine khi ô USD sai → bọc try (lỗi ô đã được báo riêng).
  .refine((v) => {
    try {
      return Number(mmkPerVndFromUsd(v.mmkPerUsd, v.vndPerUsd)) > 0;
    } catch {
      return true;
    }
  }, {
    message: "Tỷ giá MMK/VND quá nhỏ (dưới 0.000001)",
    path: ["mmkPerUsd"],
  });

export async function createRate(raw: unknown, userId: string) {
  const input = rateSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const rate = await tx.exchangeRate.create({
      data: {
        mmkPerUsd: input.mmkPerUsd,
        vndPerUsd: input.vndPerUsd,
        mmkPerVnd: mmkPerVndFromUsd(input.mmkPerUsd, input.vndPerUsd),
        note: input.note || null,
        createdById: userId,
      },
    });
    await writeAudit(tx, { userId, action: "pricing.rate.create", entity: "ExchangeRate", entityId: rate.id, data: { mmkPerUsd: input.mmkPerUsd, vndPerUsd: input.vndPerUsd } });
    return rate;
  });
}

const blankToUndefined = (v: unknown) => (v === "" || v == null ? undefined : v);

export const previewSchema = z.object({
  /** Kho tính giá (P24). Bỏ trống = cách cũ: mọi biến thể, vốn VND × tỷ giá × (1 + % lãi), không ship. */
  locationId: z.preprocess(blankToUndefined, rawId.optional()),
  rateId: z.preprocess(blankToUndefined, rawId.optional()),
  marginPct: z.preprocess(
    blankToUndefined,
    decimalString(2, (v) => v <= BigInt(100_000), "% lãi từ 0 đến 1000, tối đa 2 chữ số thập phân").optional(),
  ),
  shipMmkPerKg: z.preprocess(blankToUndefined, z.coerce.number().int().min(0).max(100_000_000).optional()),
  roundTo: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(100_000).optional()),
  categoryId: z.preprocess(blankToUndefined, rawId.optional()),
  brandId: z.preprocess(blankToUndefined, rawId.optional()),
  variantIds: z.array(rawId).min(1).max(5000).optional(),
  receiptId: z.preprocess(blankToUndefined, rawId.optional()),
  /** Lô làm cơ sở (16/11): biến thể → dòng phiếu nhập (lần nhập) dùng tính; trống = lần nhập gần nhất. */
  sources: z.record(z.string(), rawId).optional(),
});

type Mode = "VN_IMPORT" | "LOCAL_MMK" | null;
/** Tham số của cả bản xem trước — cố định theo run, không cần nằm trong fingerprint từng dòng. */
type RunCtx = {
  mode: Mode;
  rate: { mmkPerVnd: Prisma.Decimal | string; mmkPerUsd?: Prisma.Decimal | string | null; vndPerUsd?: Prisma.Decimal | string | null } | null;
  marginPct: string | null;
  shipMmkPerKg: number | null;
  roundTo: number;
};
/** PRICE_ZERO (F4): công thức ra giá ≤ 0 (vd vốn 0 + lãi 0) — không bao giờ đưa vào bản xem trước. */
export type SkipReason = "NO_COST" | "NO_WEIGHT" | "NO_PROFIT" | "PRICE_ZERO";
export type ComputedLine = {
  variantId: string;
  costVnd?: number;
  costMmk?: number;
  shipMmk?: number;
  profitMmk?: number;
  oldPriceMmk: number;
  newPriceMmk: number;
  sourceBatchId?: string;
  sourceDocumentId?: string;
  sourcePostedAt?: Date | null;
  sourceLineId?: string;
  weightGrams?: number;
  weightFromComponents: boolean;
  fingerprint: string;
  /** Giá / hoa hồng hiệu lực (chờ duyệt nếu có) lúc tạo dòng — áp dụng so với giá trị hiện tại. */
  basePriceMmk?: number;
  baseCommissionMmk?: number | null;
  /** MANUAL kho VND: lãi VND, giá bán VND, hoa hồng CTV mới (cũng là hoa hồng cố định của SKU). */
  profitVnd?: number;
  sellVnd?: number;
  commissionMmk?: number | null;
};

/**
 * Phiên bản cách chọn nguồn giá + công thức (D1). Đổi cách tính → tăng số để bản cũ không áp được.
 * 3 (16/11): nguồn giá bỏ dòng Tester / khu chờ kiểm tra / kho bán khác; chọn được lần nhập làm cơ sở.
 */
export const FORMULA_VERSION = 3;

const fingerprintOf = (input: unknown) => createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 32);

/**
 * Tính dòng giá cho các biến thể theo tham số run — dùng chung lúc XEM TRƯỚC và lúc ÁP DỤNG (tính lại fingerprint).
 * Biến thể không đủ dữ liệu → `skipped` kèm lý do (thiếu vốn / khối lượng / lãi cố định), không tạo giá giả.
 * Khối lượng combo (VN_IMPORT): của combo nếu khai báo, chưa có thì cộng thành phần × số lượng.
 */
async function computeLines(tx: Tx, variantIds: string[], ctx: RunCtx, sources?: Map<string, string>) {
  const variants = await tx.variant.findMany({
    where: { id: { in: variantIds }, active: true },
    orderBy: { sku: "asc" },
    select: {
      id: true,
      sku: true,
      priceMmk: true,
      weightGrams: true,
      isBundle: true,
      product: { select: { fixedProfitMmk: true, stockLocationId: true } },
      bundleItems: { select: { qty: true, component: { select: { weightGrams: true } } } },
    },
  });
  // VN pricing adds freight per kg separately; its base must exclude shipment costs.
  const costs = await variantCosts(tx, variants.map((v) => v.id), ctx.mode === "LOCAL_MMK" ? "MMK" : "VND", ctx.mode === "VN_IMPORT" ? "PURCHASE" : "LANDED", { sourceLineIds: sources });
  const lines: ComputedLine[] = [];
  const skipped: { variantId: string; sku: string; reason: SkipReason }[] = [];
  for (const v of variants) {
    const cost = costs.get(v.id);
    if (!cost) {
      skipped.push({ variantId: v.id, sku: v.sku, reason: "NO_COST" });
      continue;
    }
    const src = cost.source;
    const base = {
      variantId: v.id,
      oldPriceMmk: v.priceMmk,
      sourceBatchId: src?.batchId,
      sourceDocumentId: src?.documentId,
      sourcePostedAt: src?.postedAt,
      sourceLineId: src?.lineId,
    };
    // Đầu vào riêng của dòng: nguồn giá (dòng phiếu, giá trị), thành phần combo, kho của SP, khối lượng / lãi cố định.
    const inputs = {
      v: FORMULA_VERSION,
      mode: ctx.mode,
      loc: v.product.stockLocationId,
      cost: cost.costVnd,
      src: src?.lineId ?? null,
      comps: cost.components?.map((c) => [c.componentId, c.qty, c.source?.lineId ?? null, c.cost]) ?? null,
    };
    if (ctx.mode === "LOCAL_MMK") {
      const profit = v.product.fixedProfitMmk;
      if (profit == null) {
        skipped.push({ variantId: v.id, sku: v.sku, reason: "NO_PROFIT" });
        continue;
      }
      const newPriceMmk = priceLocalMmk({ costMmk: cost.costVnd, fixedProfitMmk: profit, roundTo: ctx.roundTo });
      lines.push({ ...base, costMmk: cost.costVnd, profitMmk: profit, newPriceMmk, weightFromComponents: false, fingerprint: fingerprintOf({ ...inputs, profit }) });
      continue;
    }
    if (ctx.mode === "VN_IMPORT") {
      const own = v.weightGrams && v.weightGrams > 0 ? v.weightGrams : null;
      const parts = v.isBundle && v.bundleItems.length > 0 && v.bundleItems.every((b) => (b.component.weightGrams ?? 0) > 0);
      const weight = own ?? (parts ? v.bundleItems.reduce((s, b) => s + b.component.weightGrams! * b.qty, 0) : null);
      if (!weight) {
        skipped.push({ variantId: v.id, sku: v.sku, reason: "NO_WEIGHT" });
        continue;
      }
      const fromComponents = own == null;
      const newPriceMmk = priceVnImport({
        ...ctx.rate!,
        costVnd: cost.costVnd,
        marginPct: ctx.marginPct!,
        shipMmkPerKg: ctx.shipMmkPerKg!,
        weightGrams: weight,
        roundTo: ctx.roundTo,
      });
      lines.push({
        ...base,
        costVnd: cost.costVnd,
        shipMmk: shippingMmk(ctx.shipMmkPerKg!, weight),
        newPriceMmk,
        weightGrams: weight,
        weightFromComponents: fromComponents,
        fingerprint: fingerprintOf({ ...inputs, weight, fromComponents }),
      });
      continue;
    }
    const newPriceMmk = suggestPrice({ ...ctx.rate!, costVnd: cost.costVnd, marginPct: ctx.marginPct!, roundTo: ctx.roundTo });
    lines.push({ ...base, costVnd: cost.costVnd, newPriceMmk, weightFromComponents: false, fingerprint: fingerprintOf(inputs) });
  }
  // F4: giá bán phải > 0 — dòng ra giá ≤ 0 chuyển sang danh sách bỏ qua (lúc áp dụng thiếu dòng → INPUT_CHANGED).
  const sku = new Map(variants.map((v) => [v.id, v.sku]));
  for (const l of lines.filter((l) => l.newPriceMmk <= 0)) skipped.push({ variantId: l.variantId, sku: sku.get(l.variantId)!, reason: "PRICE_ZERO" });
  return { lines: lines.filter((l) => l.newPriceMmk > 0), skipped };
}

/**
 * Tạo bản xem trước. Có kho (P24):
 *  - VN_IMPORT (Kho Thắm): cần tỷ giá, % lãi, ship MMK/kg; biến thể thiếu vốn VND / khối lượng bị bỏ qua.
 *  - LOCAL_MMK (Kho Chi): vốn MMK + lãi cố định của SP; thiếu vốn MMK / lãi bị bỏ qua.
 * D1: mỗi dòng lưu nguồn giá (lô + phiếu nhập đã ghi sổ) + fingerprint đầu vào; bản có hạn `pricing.previewDays`;
 * danh sách bị bỏ qua lưu kèm lý do. Dòng giá không đổi được đánh dấu bỏ qua ngay.
 */
export async function previewRun(raw: unknown, userId: string, now = new Date()) {
  const input = previewSchema.parse(raw);
  const [defaultRound, previewDays] = await Promise.all([getNumberSetting("pricing.roundTo"), getNumberSetting("pricing.previewDays")]);
  const roundTo = input.roundTo ?? defaultRound;
  return prisma.$transaction(
    async (tx) => {
      const location = input.locationId ? await tx.location.findUnique({ where: { id: input.locationId } }) : null;
      if (input.locationId && (!location?.sellable || !location.active)) throw new PricingError("Kho tính giá phải là kho bán đang dùng");
      const mode: Mode = location ? (location.pricingMode ?? "VN_IMPORT") : null;
      const needsRate = mode !== "LOCAL_MMK";
      if (needsRate && (!input.rateId || input.marginPct === undefined)) throw new PricingError("Chọn tỷ giá và nhập % lãi");
      if (mode === "VN_IMPORT" && input.shipMmkPerKg === undefined) throw new PricingError("Nhập phí ship VN → MM (MMK/kg)");
      const rate = needsRate ? await tx.exchangeRate.findUnique({ where: { id: input.rateId! } }) : null;
      if (needsRate && !rate) throw new PricingError("Tỷ giá không tồn tại");

      const productWhere: Prisma.ProductWhereInput = location ? { stockLocationId: location.id, archivedAt: null } : {};
      if (input.categoryId) {
        productWhere.OR = [{ categoryId: input.categoryId }, { category: { parentId: input.categoryId } }];
      }
      if (input.brandId) productWhere.brandId = input.brandId;
      let scopeIds = input.variantIds;
      if (input.receiptId) {
        const receipt = await tx.stockDocument.findFirst({ where: { id: input.receiptId, type: "RECEIVE", status: "POSTED" }, select: { lines: { select: { variantId: true } } } });
        if (!receipt) throw new PricingError("Chỉ tính giá từ phiếu nhập đã ghi sổ");
        const receivedIds = [...new Set(receipt.lines.map(l => l.variantId))];
        scopeIds = scopeIds ? scopeIds.filter(id => receivedIds.includes(id)) : receivedIds;
      }
      const ids = await tx.variant.findMany({ where: { active: true, product: productWhere, ...(scopeIds && { id: { in: scopeIds } }) }, select: { id: true } });
      const ctx: RunCtx = {
        mode,
        rate,
        marginPct: needsRate ? input.marginPct! : null,
        shipMmkPerKg: mode === "VN_IMPORT" ? input.shipMmkPerKg! : null,
        roundTo,
      };
      const sources = input.sources ? new Map(Object.entries(input.sources)) : undefined;
      const { lines, skipped } = await computeLines(tx, ids.map((v) => v.id), ctx, sources);
      if (lines.length === 0) throw new PricingError("Không có phân loại nào đủ dữ liệu để tính giá (xem danh sách thiếu vốn / khối lượng / lãi)");
      // 16/11: so với giá HIỆU LỰC (giá chờ duyệt nếu có) — được thay giá chờ bằng kết quả mới.
      const eff = await effectivePricingOf(tx, lines.map((l) => l.variantId));
      for (const l of lines) {
        const e = eff.get(l.variantId)!;
        l.basePriceMmk = e.priceMmk;
        l.baseCommissionMmk = e.commission;
        // Chỉ lưu lần nhập NGƯỜI DÙNG CHỌN: dòng theo "lần nhập gần nhất" có phiếu nhập mới sau xem trước → INPUT_CHANGED.
        l.sourceLineId = sources?.get(l.variantId);
      }
      const run = await tx.priceUpdateRun.create({
        data: {
          locationId: location?.id,
          rateId: rate?.id,
          marginPct: ctx.marginPct,
          shipMmkPerKg: ctx.shipMmkPerKg,
          roundTo,
          createdById: userId,
          createdAt: now,
          formulaVersion: FORMULA_VERSION,
          expiresAt: new Date(now.getTime() + previewDays * DAY_MS),
          skipped: skipped.length ? skipped : undefined,
          lines: {
            create: lines.map((l) => ({
              ...l,
              ...(l.newPriceMmk === l.basePriceMmk && { status: "SKIPPED" as const, skipReason: "UNCHANGED" }),
            })),
          },
        },
      });
      await tx.auditLog.create({
        data: { userId, action: "pricing.preview", entity: "PriceUpdateRun", entityId: run.id, data: { lines: lines.length, skipped: skipped.length } },
      });
      return run;
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}

export type ApplySkip = { sku: string; reason: "PRICE_CHANGED" | "INPUT_CHANGED" | "COMMISSION_OVER_PRICE" };
type RunLineRow = Prisma.PriceRunLineGetPayload<{ include: { variant: { select: { sku: true } } } }>;
export type AppliedDetail = { sku: string; price: [number, number]; commission?: [number | null, number | null]; staged: boolean };

/**
 * Áp các dòng (trong transaction, đã khoá bản tính). Dùng chung cho bảng tính (AUTO) và Thủ công (MANUAL).
 *  - `fresh` (AUTO): dòng tính lại từ đầu vào hiện tại; fingerprint / giá khác → INPUT_CHANGED.
 *  - So giá + hoa hồng HIỆU LỰC hiện tại với lúc tạo dòng (`base*`) → khác: PRICE_CHANGED (không ghi đè chỉnh sửa
 *    xen giữa). Khớp → được THAY giá chờ duyệt bằng kết quả mới, giữ các phần khác của bản đang sửa.
 *  - Hoa hồng CTV hiệu lực sau khi áp > giá mới → COMMISSION_OVER_PRICE.
 *  - SP đã duyệt → giá (+ hoa hồng MANUAL) vào bản đang sửa, có hiệu lực cùng lúc khi duyệt; chưa duyệt → ghi thẳng.
 */
async function applyLines(tx: Tx, runId: string, lines: RunLineRow[], fresh: Map<string, ComputedLine> | null, userId: string, now: Date) {
  await lockCatalog(tx);
  const owners = await tx.variant.findMany({ where: { id: { in: lines.map((l) => l.variantId) } }, select: { id: true, productId: true, product: { select: { approvedAt: true } } } });
  const productIds = [...new Set(owners.map((v) => v.productId))].sort();
  if (productIds.length) await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" IN (${Prisma.join(productIds)}) ORDER BY "id" FOR UPDATE`;
  const owner = new Map(owners.map((v) => [v.id, v]));
  const before = await changedBefore(tx, productIds);
  return guardApproval(tx, productIds, userId, async () => {
    const current = await effectivePricingOf(tx, lines.map((l) => l.variantId));
    let applied = 0;
    const stagedProducts = new Set<string>();
    const skipped: ApplySkip[] = [];
    const details: AppliedDetail[] = [];
    const skip = async (l: RunLineRow, reason: ApplySkip["reason"]) => {
      skipped.push({ sku: l.variant.sku, reason });
      await tx.priceRunLine.update({ where: { id: l.id }, data: { status: "SKIPPED", skipReason: reason } });
    };
    for (const l of lines) {
      if (fresh) {
        const f = fresh.get(l.variantId);
        if (!l.fingerprint || !f || f.fingerprint !== l.fingerprint || f.newPriceMmk !== l.newPriceMmk || l.newPriceMmk <= 0) {
          await skip(l, "INPUT_CHANGED");
          continue;
        }
      }
      const cur = current.get(l.variantId)!;
      // Dòng tạo trước 16/11 không có `basePriceMmk` → so theo giá đang bán như cũ, không so hoa hồng.
      const baseOk = l.basePriceMmk != null ? cur.priceMmk === l.basePriceMmk && cur.commission === l.baseCommissionMmk : cur.priceMmk === l.oldPriceMmk && !cur.pending;
      if (!baseOk) {
        await skip(l, "PRICE_CHANGED");
        continue;
      }
      const setsCommission = l.commissionMmk != null;
      const commission = setsCommission ? l.commissionMmk : cur.commission;
      if (commissionOverPrice(l.newPriceMmk, commission)) {
        await skip(l, "COMMISSION_OVER_PRICE");
        continue;
      }
      const o = owner.get(l.variantId)!;
      const commissionChanged = setsCommission && commission !== cur.commission;
      if (o.product.approvedAt) {
        await stagePrices(tx, o.productId, [{ variantId: l.variantId, priceMmk: l.newPriceMmk, ...(setsCommission && { commission }), reason: "bulk", runId }], userId);
        current.set(l.variantId, { priceMmk: l.newPriceMmk, commission, pending: true });
        stagedProducts.add(o.productId);
      } else {
        const ok = await writeLivePrice(tx, {
          variantId: l.variantId,
          from: { priceMmk: cur.priceMmk, commission: cur.commission },
          to: { priceMmk: l.newPriceMmk, commission },
          reason: "bulk",
          runId,
          userId,
          at: now,
        });
        if (!ok) {
          await skip(l, "PRICE_CHANGED");
          continue;
        }
      }
      await tx.priceRunLine.update({ where: { id: l.id }, data: { status: "APPLIED", appliedAt: now } });
      details.push({
        sku: l.variant.sku,
        price: [cur.priceMmk, l.newPriceMmk],
        ...(commissionChanged && { commission: [cur.commission, commission ?? null] as [number | null, number | null] }),
        staged: !!o.product.approvedAt,
      });
      applied++;
    }
    const remaining = await tx.priceRunLine.count({ where: { runId, status: "PENDING" } });
    await tx.priceUpdateRun.update({ where: { id: runId }, data: { appliedAt: now, ...(remaining === 0 && { status: "APPLIED" }) } });
    await tx.auditLog.create({
      data: { userId, action: "pricing.apply", entity: "PriceUpdateRun", entityId: runId, data: { applied, skipped, remaining, awaitingApproval: stagedProducts.size, details } },
    });
    /** `awaitingApproval`: số SP đã duyệt có giá mới đang chờ duyệt (chưa hiện cho khách). */
    const touched = [...new Set(details.map((d) => owner.get(lines.find((l) => l.variant.sku === d.sku)!.variantId)!.productId))];
    return { applied, skipped, remaining, awaitingApproval: stagedProducts.size, stagedProductIds: [...stagedProducts], touched, details, changedBefore: before };
  });
}

/**
 * Áp dụng các dòng ĐANG CHỜ được chọn của bản xem trước (AUTO). Mỗi dòng tính lại đầu vào: fingerprint khác (lô/giá
 * mua/khối lượng/combo/lãi/kho đã đổi) → bỏ qua INPUT_CHANGED; giá / hoa hồng hiệu lực đã đổi sau xem trước → bỏ qua
 * PRICE_CHANGED (không ghi đè). Còn dòng chờ thì bản vẫn mở; hết dòng chờ → APPLIED. Bản quá hạn / cũ → phải tạo lại.
 * `submit` (§6.4 "Gửi duyệt ngay"): gửi duyệt các SP có dòng vừa áp, cùng transaction. Mặc định tắt.
 */
export async function applyRun(runId: string, variantIds: string[], userId: string, now = new Date(), opts: { submit?: boolean } = {}) {
  if (variantIds.length === 0) throw new PricingError("Chưa chọn phân loại nào");
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "PriceUpdateRun" WHERE "id" = ${runId} FOR UPDATE`;
      const run = await tx.priceUpdateRun.findUnique({ where: { id: runId }, include: { rate: true, location: true } });
      if (!run || run.status !== "PREVIEW") throw new PricingError("Bản xem trước đã được áp dụng hoặc huỷ");
      if (run.mode !== "AUTO" || run.formulaVersion < FORMULA_VERSION || !run.expiresAt || run.expiresAt <= now) {
        throw new PricingError("Bản xem trước đã hết hạn hoặc tạo theo cách tính cũ — tạo bản xem trước mới");
      }
      const lines = await tx.priceRunLine.findMany({
        where: { runId, variantId: { in: variantIds }, status: "PENDING" },
        include: { variant: { select: { sku: true } } },
      });
      const ctx: RunCtx = {
        mode: run.location ? (run.location.pricingMode ?? "VN_IMPORT") : null,
        rate: run.rate,
        marginPct: run.marginPct?.toString() ?? null,
        shipMmkPerKg: run.shipMmkPerKg,
        roundTo: run.roundTo,
      };
      // Tính lại theo đúng lần nhập đã dùng lúc xem trước (lô cơ sở người dùng chọn hoặc lần nhập gần nhất khi đó).
      const sources = new Map(lines.flatMap((l) => (l.sourceLineId ? [[l.variantId, l.sourceLineId] as const] : [])));
      const fresh = new Map((await computeLines(tx, lines.map((l) => l.variantId), ctx, sources)).lines.map((l) => [l.variantId, l]));
      const outcome = await applyLines(tx, runId, lines, fresh, userId, now);
      // Sau khi so dấu vân tay (guardApproval) — gửi duyệt không đổi nội dung SP.
      const review = opts.submit ? await submitTouched(tx, outcome.touched, userId, { changedBefore: outcome.changedBefore }) : null;
      return { ...outcome, review };
    },
    { maxWait: 10_000, timeout: 120_000 },
  );
}

// ── Chế độ THỦ CÔNG — kho hàng nhập VN (trang Giá bán, 16/11) ──

const money = z.coerce.number().int().min(0).max(1_000_000_000);
export const manualSchema = z.object({
  locationId: rawId,
  rateId: rawId,
  lines: z
    .array(
      z.object({
        variantId: rawId,
        /** Lần nhập (dòng phiếu) làm cơ sở; trống = lần nhập gần nhất. Combo: bỏ qua (tổng thành phần). */
        sourceLineId: z.preprocess(blankToUndefined, rawId.optional()),
        profitVnd: money,
        shipMmk: money,
        commissionMmk: money,
        /** Giá / hoa hồng hiệu lực người dùng đang thấy — khác hiện tại → bỏ qua (PRICE_CHANGED). */
        expectedPriceMmk: z.coerce.number().int().min(0),
        expectedCommissionMmk: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(0).nullable()),
      }),
    )
    .min(1)
    .max(200),
  /**
   * Tính lại theo tỷ giá mới (18/11/2026): dòng tính ra giá + hoa hồng KHÔNG đổi vẫn được ghi lịch sử "xác nhận"
   * (giá cũ = giá mới, lý do RATE_CONFIRM_REASON) để hết cảnh báo RATE_NEWER — không thì cảnh báo/nút còn mãi.
   */
  confirmUnchanged: z.boolean().optional(),
});

/** Lý do trong lịch sử giá khi xác nhận giá không đổi sau khi đổi tỷ giá. */
export const RATE_CONFIRM_REASON = "Xác nhận giá theo tỷ giá mới (không đổi)";

/**
 * Thủ công kho VND: Giá bán MMK = (giá mua NCC của lần nhập được chọn + lãi VND) ÷ tỷ giá + vận chuyển + CTV,
 * làm tròn theo `pricing.roundTo`. Máy chủ tự tính lại (không nhận giá từ trình duyệt). Tạo bản tính MANUAL và áp
 * ngay trong cùng transaction (SP đã duyệt → chờ duyệt; giá + hoa hồng có hiệu lực cùng lúc).
 */
export async function applyManualVnd(raw: unknown, userId: string, now = new Date(), opts: { submit?: boolean } = {}) {
  const input = manualSchema.parse(raw);
  const roundTo = await getNumberSetting("pricing.roundTo");
  return prisma.$transaction(
    async (tx) => {
      const location = await tx.location.findUnique({ where: { id: input.locationId } });
      if (!location?.sellable || !location.active) throw new PricingError("Kho tính giá phải là kho bán đang dùng");
      if ((location.pricingMode ?? "VN_IMPORT") !== "VN_IMPORT") throw new PricingError("Chế độ thủ công theo VND chỉ dùng cho kho hàng nhập Việt Nam");
      const rate = await tx.exchangeRate.findUnique({ where: { id: input.rateId } });
      if (!rate) throw new PricingError("Tỷ giá không tồn tại");
      const ids = input.lines.map((l) => l.variantId);
      if (new Set(ids).size !== ids.length) throw new PricingError("Mỗi SKU chỉ một dòng");
      const variants = await tx.variant.findMany({ where: { id: { in: ids } }, select: { id: true, sku: true, priceMmk: true, product: { select: { stockLocationId: true, archivedAt: true } } } });
      const byId = new Map(variants.map((v) => [v.id, v]));
      const sources = new Map(input.lines.flatMap((l) => (l.sourceLineId ? [[l.variantId, l.sourceLineId] as const] : [])));
      const costs = await variantCosts(tx, ids, "VND", "PURCHASE", { sourceLineIds: sources });
      const eff = await effectivePricingOf(tx, ids);
      const computed: ComputedLine[] = [];
      for (const l of input.lines) {
        const v = byId.get(l.variantId);
        if (!v || v.product.archivedAt) throw new PricingError("Phân loại không tồn tại hoặc đã ngừng kinh doanh");
        if (v.product.stockLocationId !== location.id) throw new PricingError(`${v.sku} không thuộc kho ${location.code}`);
        const cost = costs.get(l.variantId);
        if (!cost) throw new PricingError(`${v.sku}: chưa có giá mua từ phiếu nhập đã ghi sổ (hoặc lần nhập đã chọn không hợp lệ)`);
        const e = eff.get(l.variantId)!;
        if (e.priceMmk !== l.expectedPriceMmk || e.commission !== l.expectedCommissionMmk) {
          throw new PricingError(`Giá / hoa hồng của ${v.sku} vừa được đổi ở nơi khác — tải lại trang`);
        }
        const newPriceMmk = priceVndManual({ ...rate, purchaseVnd: cost.costVnd, profitVnd: l.profitVnd, shipMmk: l.shipMmk, commissionMmk: l.commissionMmk, roundTo });
        if (newPriceMmk <= 0) throw new PricingError(`${v.sku}: giá bán phải lớn hơn 0`);
        computed.push({
          variantId: v.id,
          costVnd: cost.costVnd,
          shipMmk: l.shipMmk,
          oldPriceMmk: v.priceMmk,
          newPriceMmk,
          sourceBatchId: cost.source?.batchId,
          sourceDocumentId: cost.source?.documentId,
          sourcePostedAt: cost.source?.postedAt,
          sourceLineId: cost.source?.lineId,
          weightFromComponents: false,
          fingerprint: fingerprintOf({ v: FORMULA_VERSION, mode: "MANUAL", src: cost.source?.lineId ?? null, comps: cost.components?.map((c) => [c.componentId, c.qty, c.source?.lineId ?? null, c.cost]) ?? null, cost: cost.costVnd, l }),
          basePriceMmk: e.priceMmk,
          baseCommissionMmk: e.commission,
          profitVnd: l.profitVnd,
          sellVnd: cost.costVnd + l.profitVnd,
          commissionMmk: l.commissionMmk,
        });
      }
      const changed = computed.filter((c) => c.newPriceMmk !== c.basePriceMmk || c.commissionMmk !== c.baseCommissionMmk);
      const confirm = input.confirmUnchanged ? computed.filter((c) => !changed.includes(c)) : [];
      if (changed.length === 0 && confirm.length === 0) throw new PricingError("Giá và hoa hồng không đổi so với hiện tại");
      const writeConfirms = async (runId: string | null) => {
        for (const c of confirm) {
          await recordPriceConfirmation(tx, { variantId: c.variantId, priceMmk: c.oldPriceMmk, reason: RATE_CONFIRM_REASON, runId, userId, at: now });
        }
      };
      if (changed.length === 0) {
        await writeConfirms(null);
        return { applied: 0, skipped: [], remaining: 0, awaitingApproval: 0, runId: null, unchanged: confirm.length, confirmed: confirm.length, review: null };
      }
      const run = await tx.priceUpdateRun.create({
        data: {
          mode: "MANUAL",
          locationId: location.id,
          rateId: rate.id,
          roundTo,
          createdById: userId,
          createdAt: now,
          formulaVersion: FORMULA_VERSION,
          expiresAt: now,
          lines: { create: changed },
        },
      });
      await tx.$queryRaw`SELECT "id" FROM "PriceUpdateRun" WHERE "id" = ${run.id} FOR UPDATE`;
      const lines = await tx.priceRunLine.findMany({ where: { runId: run.id }, include: { variant: { select: { sku: true } } } });
      const outcome = await applyLines(tx, run.id, lines, null, userId, now);
      await writeConfirms(run.id);
      const review = opts.submit ? await submitTouched(tx, outcome.touched, userId, { changedBefore: outcome.changedBefore }) : null;
      return { ...outcome, runId: run.id as string | null, unchanged: computed.length - changed.length, confirmed: confirm.length, review };
    },
    { maxWait: 10_000, timeout: 120_000 },
  );
}

/** Huỷ bản xem trước (kể cả bản đã áp một phần): dòng còn chờ → bỏ qua; dòng đã áp giữ nguyên. */
export async function cancelRun(runId: string, userId: string) {
  await prisma.$transaction(async (tx) => {
    const res = await tx.priceUpdateRun.updateMany({ where: { id: runId, status: "PREVIEW" }, data: { status: "CANCELLED" } });
    if (res.count !== 1) throw new PricingError("Chỉ huỷ được bản xem trước");
    await tx.priceRunLine.updateMany({ where: { runId, status: "PENDING" }, data: { status: "SKIPPED", skipReason: "CANCELLED" } });
    await tx.auditLog.create({ data: { userId, action: "pricing.cancel", entity: "PriceUpdateRun", entityId: runId } });
  });
}
