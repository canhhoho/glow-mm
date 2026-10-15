import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { getNumberSetting } from "@/server/settings";
import { variantCosts } from "./cost";
import { parseScaled, suggestPrice } from "./formula";

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

export const rateSchema = z.object({
  mmkPerVnd: decimalString(6, (v) => v > BigInt(0), "Tỷ giá phải > 0, tối đa 6 chữ số thập phân"),
  note: z.string().trim().max(200).optional(),
});

export async function createRate(raw: unknown, userId: string) {
  const input = rateSchema.parse(raw);
  return prisma.exchangeRate.create({
    data: { mmkPerVnd: input.mmkPerVnd, note: input.note || null, createdById: userId },
  });
}

export const previewSchema = z.object({
  rateId: z.string().min(1),
  marginPct: decimalString(2, (v) => v <= BigInt(100_000), "% lãi từ 0 đến 1000, tối đa 2 chữ số thập phân"),
  roundTo: z.coerce.number().int().min(1).max(100_000).optional(),
  categoryId: z.string().min(1).optional(),
  brandId: z.string().min(1).optional(),
});

/** Tạo bản xem trước cho các biến thể đang bán (lọc theo danh mục/thương hiệu nếu có). */
export async function previewRun(raw: unknown, userId: string) {
  const input = previewSchema.parse(raw);
  const roundTo = input.roundTo ?? (await getNumberSetting("pricing.roundTo"));
  return prisma.$transaction(
    async (tx) => {
      const rate = await tx.exchangeRate.findUnique({ where: { id: input.rateId } });
      if (!rate) throw new PricingError("Tỷ giá không tồn tại");
      const productWhere: Prisma.ProductWhereInput = {};
      if (input.categoryId) {
        productWhere.OR = [{ categoryId: input.categoryId }, { category: { parentId: input.categoryId } }];
      }
      if (input.brandId) productWhere.brandId = input.brandId;
      const variants = await tx.variant.findMany({
        where: { active: true, product: productWhere },
        select: { id: true, priceMmk: true },
      });
      const costs = await variantCosts(tx, variants.map((v) => v.id));
      const lines = variants.flatMap((v) => {
        const cost = costs.get(v.id);
        if (!cost) return [];
        const newPriceMmk = suggestPrice({
          costVnd: cost.costVnd,
          mmkPerVnd: rate.mmkPerVnd.toString(),
          marginPct: input.marginPct,
          roundTo,
        });
        return [{ variantId: v.id, costVnd: cost.costVnd, oldPriceMmk: v.priceMmk, newPriceMmk }];
      });
      if (lines.length === 0) throw new PricingError("Không có biến thể nào có giá vốn để tính");
      const run = await tx.priceUpdateRun.create({
        data: { rateId: rate.id, marginPct: input.marginPct, roundTo, createdById: userId, lines: { create: lines } },
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
