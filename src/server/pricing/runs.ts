import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { rawId } from "@/lib/schemas";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { getNumberSetting } from "@/server/settings";
import type { Tx } from "@/server/inventory/ledger";
import { variantCosts } from "./cost";
import { guardApproval } from "@/server/catalog/approval";
import { mmkPerVndFromUsd, parseScaled, priceLocalMmk, priceVnImport, shippingMmk, suggestPrice } from "./formula";

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
  return prisma.exchangeRate.create({
    data: {
      mmkPerUsd: input.mmkPerUsd,
      vndPerUsd: input.vndPerUsd,
      mmkPerVnd: mmkPerVndFromUsd(input.mmkPerUsd, input.vndPerUsd),
      note: input.note || null,
      createdById: userId,
    },
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
type ComputedLine = {
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
  weightGrams?: number;
  weightFromComponents: boolean;
  fingerprint: string;
};

/** Phiên bản cách chọn nguồn giá + công thức (D1). Đổi cách tính → tăng số để bản cũ không áp được. */
export const FORMULA_VERSION = 2;

const fingerprintOf = (input: unknown) => createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 32);

/**
 * Tính dòng giá cho các biến thể theo tham số run — dùng chung lúc XEM TRƯỚC và lúc ÁP DỤNG (tính lại fingerprint).
 * Biến thể không đủ dữ liệu → `skipped` kèm lý do (thiếu vốn / khối lượng / lãi cố định), không tạo giá giả.
 * Khối lượng combo (VN_IMPORT): của combo nếu khai báo, chưa có thì cộng thành phần × số lượng.
 */
async function computeLines(tx: Tx, variantIds: string[], ctx: RunCtx) {
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
  const costs = await variantCosts(tx, variants.map((v) => v.id), ctx.mode === "LOCAL_MMK" ? "MMK" : "VND", ctx.mode === "VN_IMPORT" ? "PURCHASE" : "LANDED");
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
    };
    // Đầu vào riêng của dòng: nguồn giá (dòng phiếu, giá trị), thành phần combo, kho của SP, khối lượng / lãi cố định.
    const inputs = {
      v: FORMULA_VERSION,
      mode: ctx.mode,
      loc: v.product.stockLocationId,
      cost: cost.costVnd,
      src: src?.lineId ?? null,
      comps: cost.components?.map((c) => [c.componentId, c.qty, c.source.lineId, c.cost]) ?? null,
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
      const { lines, skipped } = await computeLines(tx, ids.map((v) => v.id), ctx);
      if (lines.length === 0) throw new PricingError("Không có biến thể nào đủ dữ liệu để tính giá (xem danh sách thiếu vốn / khối lượng / lãi)");
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
              ...(l.newPriceMmk === l.oldPriceMmk && { status: "SKIPPED" as const, skipReason: "UNCHANGED" }),
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

export type ApplySkip = { sku: string; reason: "PRICE_CHANGED" | "INPUT_CHANGED" };

/**
 * Áp dụng các dòng ĐANG CHỜ được chọn. Mỗi dòng tính lại đầu vào: fingerprint khác (lô/giá mua/khối lượng/combo/
 * lãi/kho đã đổi) → bỏ qua INPUT_CHANGED; giá đã bị sửa sau xem trước → bỏ qua PRICE_CHANGED (không ghi đè).
 * Còn dòng chờ thì bản vẫn mở (áp tiếp / huỷ được); hết dòng chờ → APPLIED. Bản quá hạn / tạo trước D1 → phải tạo lại.
 */
export async function applyRun(runId: string, variantIds: string[], userId: string, now = new Date()) {
  if (variantIds.length === 0) throw new PricingError("Chưa chọn biến thể nào");
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "PriceUpdateRun" WHERE "id" = ${runId} FOR UPDATE`;
      const run = await tx.priceUpdateRun.findUnique({ where: { id: runId }, include: { rate: true, location: true } });
      if (!run || run.status !== "PREVIEW") throw new PricingError("Bản xem trước đã được áp dụng hoặc huỷ");
      if (run.formulaVersion < FORMULA_VERSION || !run.expiresAt || run.expiresAt <= now) {
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
      const fresh = new Map((await computeLines(tx, lines.map((l) => l.variantId), ctx)).lines.map((l) => [l.variantId, l]));
      // QT2: đổi giá SP đã duyệt → huỷ duyệt (cần duyệt lại).
      const productIds = (await tx.variant.findMany({ where: { id: { in: lines.map((l) => l.variantId) } }, select: { productId: true } })).map((v) => v.productId);
      return guardApproval(tx, productIds, userId, async () => {

      let applied = 0;
      const skipped: ApplySkip[] = [];
      const skip = async (l: (typeof lines)[number], reason: ApplySkip["reason"]) => {
        skipped.push({ sku: l.variant.sku, reason });
        await tx.priceRunLine.update({ where: { id: l.id }, data: { status: "SKIPPED", skipReason: reason } });
      };
      for (const l of lines) {
        const f = fresh.get(l.variantId);
        if (!l.fingerprint || !f || f.fingerprint !== l.fingerprint || f.newPriceMmk !== l.newPriceMmk || l.newPriceMmk <= 0) {
          await skip(l, "INPUT_CHANGED");
          continue;
        }
        // Chỉ đổi nếu giá vẫn đúng như lúc xem trước (không ghi đè chỉnh sửa tay xen giữa).
        const res = await tx.variant.updateMany({ where: { id: l.variantId, priceMmk: l.oldPriceMmk }, data: { priceMmk: l.newPriceMmk } });
        if (res.count !== 1) {
          await skip(l, "PRICE_CHANGED");
          continue;
        }
        await tx.priceRunLine.update({ where: { id: l.id }, data: { status: "APPLIED", appliedAt: now } });
        await tx.priceHistory.create({
          data: { variantId: l.variantId, oldPriceMmk: l.oldPriceMmk, newPriceMmk: l.newPriceMmk, runId, reason: "bulk", userId, createdAt: now },
        });
        applied++;
      }
      const remaining = await tx.priceRunLine.count({ where: { runId, status: "PENDING" } });
      await tx.priceUpdateRun.update({ where: { id: runId }, data: { appliedAt: now, ...(remaining === 0 && { status: "APPLIED" }) } });
      await tx.auditLog.create({
        data: { userId, action: "pricing.apply", entity: "PriceUpdateRun", entityId: runId, data: { applied, skipped, remaining } },
      });
      return { applied, skipped, remaining };
      });
    },
    { maxWait: 10_000, timeout: 30_000 },
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
