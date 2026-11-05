import "server-only";
import { z } from "zod";
import { rawId } from "@/lib/schemas";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { getNumberSetting } from "@/server/settings";
import { variantCosts } from "./cost";
import { mmkPerVndFromUsd, parseScaled, priceLocalMmk, priceVnImport, shippingMmk, suggestPrice } from "./formula";

/**
 * Cập nhật giá hàng loạt: nhập tỷ giá → tạo bản XEM TRƯỚC (lưu từng dòng) → chọn dòng → ÁP DỤNG.
 * Áp dụng dùng đúng số đã xem trước; dòng mà giá đã bị sửa sau khi xem trước sẽ bị bỏ qua.
 */

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
});

type PreviewLine = { variantId: string; costVnd?: number; costMmk?: number; shipMmk?: number; profitMmk?: number; oldPriceMmk: number; newPriceMmk: number };

/**
 * Tạo bản xem trước. Có kho (P24):
 *  - VN_IMPORT (Kho Thắm): cần tỷ giá, % lãi, ship MMK/kg; biến thể thiếu vốn VND / khối lượng bị bỏ qua.
 *  - LOCAL_MMK (Kho Chi): vốn MMK lô mới nhất + lãi cố định của SP; thiếu vốn MMK / lãi bị bỏ qua.
 * Danh sách bị bỏ qua xem ở `pricingGaps` (trang Tính giá).
 */
export async function previewRun(raw: unknown, userId: string) {
  const input = previewSchema.parse(raw);
  const roundTo = input.roundTo ?? (await getNumberSetting("pricing.roundTo"));
  return prisma.$transaction(
    async (tx) => {
      const location = input.locationId ? await tx.location.findUnique({ where: { id: input.locationId } }) : null;
      if (input.locationId && (!location?.sellable || !location.active)) throw new PricingError("Kho tính giá phải là kho bán đang dùng");
      const mode = location ? (location.pricingMode ?? "VN_IMPORT") : null;
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
      const variants = await tx.variant.findMany({
        where: { active: true, product: productWhere },
        select: { id: true, priceMmk: true, weightGrams: true, product: { select: { fixedProfitMmk: true } } },
      });
      const costs = await variantCosts(tx, variants.map((v) => v.id), mode === "LOCAL_MMK" ? "MMK" : "VND");
      const lines = variants.flatMap((v): PreviewLine[] => {
        const cost = costs.get(v.id);
        if (!cost) return [];
        if (mode === "LOCAL_MMK") {
          const profit = v.product.fixedProfitMmk;
          if (profit == null) return [];
          const newPriceMmk = priceLocalMmk({ costMmk: cost.costVnd, fixedProfitMmk: profit, roundTo });
          return [{ variantId: v.id, costMmk: cost.costVnd, profitMmk: profit, oldPriceMmk: v.priceMmk, newPriceMmk }];
        }
        if (mode === "VN_IMPORT") {
          if (!v.weightGrams) return []; // thiếu khối lượng → không tính được phí ship
          const newPriceMmk = priceVnImport({
            ...rate!,
            costVnd: cost.costVnd,
            marginPct: input.marginPct!,
            shipMmkPerKg: input.shipMmkPerKg!,
            weightGrams: v.weightGrams,
            roundTo,
          });
          const shipMmk = shippingMmk(input.shipMmkPerKg!, v.weightGrams);
          return [{ variantId: v.id, costVnd: cost.costVnd, shipMmk, oldPriceMmk: v.priceMmk, newPriceMmk }];
        }
        const newPriceMmk = suggestPrice({ ...rate!, costVnd: cost.costVnd, marginPct: input.marginPct!, roundTo });
        return [{ variantId: v.id, costVnd: cost.costVnd, oldPriceMmk: v.priceMmk, newPriceMmk }];
      });
      if (lines.length === 0) throw new PricingError("Không có biến thể nào đủ dữ liệu để tính giá (xem danh sách thiếu vốn / khối lượng / lãi)");
      const run = await tx.priceUpdateRun.create({
        data: {
          locationId: location?.id,
          rateId: rate?.id,
          marginPct: needsRate ? input.marginPct : null,
          shipMmkPerKg: mode === "VN_IMPORT" ? input.shipMmkPerKg : null,
          roundTo,
          createdById: userId,
          lines: { create: lines },
        },
      });
      await tx.auditLog.create({
        data: { userId, action: "pricing.preview", entity: "PriceUpdateRun", entityId: run.id, data: { lines: lines.length } },
      });
      return run;
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}

/** Áp dụng các dòng được chọn. Trả về số dòng đã áp dụng và SKU bị bỏ qua (giá đã đổi sau khi xem trước). */
export async function applyRun(runId: string, variantIds: string[], userId: string) {
  if (variantIds.length === 0) throw new PricingError("Chưa chọn biến thể nào");
  return prisma.$transaction(
    async (tx) => {
      const claimed = await tx.priceUpdateRun.updateMany({
        where: { id: runId, status: "PREVIEW" },
        data: { status: "APPLIED", appliedAt: new Date() },
      });
      if (claimed.count !== 1) throw new PricingError("Bản xem trước đã được áp dụng hoặc huỷ");

      const lines = await tx.priceRunLine.findMany({
        where: { runId, variantId: { in: variantIds } },
        include: { variant: { select: { sku: true } } },
      });
      let applied = 0;
      const skipped: string[] = [];
      for (const l of lines) {
        if (l.newPriceMmk === l.oldPriceMmk) continue;
        // Chỉ đổi nếu giá vẫn đúng như lúc xem trước (không ghi đè chỉnh sửa tay xen giữa).
        const res = await tx.variant.updateMany({
          where: { id: l.variantId, priceMmk: l.oldPriceMmk },
          data: { priceMmk: l.newPriceMmk },
        });
        if (res.count !== 1) {
          skipped.push(l.variant.sku);
          continue;
        }
        await tx.priceHistory.create({
          data: {
            variantId: l.variantId,
            oldPriceMmk: l.oldPriceMmk,
            newPriceMmk: l.newPriceMmk,
            runId,
            reason: "bulk",
            userId,
          },
        });
        applied++;
      }
      await tx.auditLog.create({
        data: { userId, action: "pricing.apply", entity: "PriceUpdateRun", entityId: runId, data: { applied, skipped } },
      });
      return { applied, skipped };
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}

export async function cancelRun(runId: string, userId: string) {
  const res = await prisma.priceUpdateRun.updateMany({
    where: { id: runId, status: "PREVIEW" },
    data: { status: "CANCELLED" },
  });
  if (res.count !== 1) throw new PricingError("Chỉ huỷ được bản xem trước");
  await prisma.auditLog.create({ data: { userId, action: "pricing.cancel", entity: "PriceUpdateRun", entityId: runId } });
}
