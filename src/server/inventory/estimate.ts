import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rawId } from "@/lib/schemas";
import { convertVndToMmk, shippingMmk } from "@/server/pricing/formula";
import { latestRate } from "@/server/pricing/latest-rate";

/** Explicitly estimate existing posted batches; historical order snapshots remain unchanged. */
export async function estimateBatchCost(raw: unknown, userId: string) {
  const input = z.object({ batchId: rawId, shipMmkPerKg: z.preprocess((v) => v === "" ? undefined : v, z.coerce.number().int().min(0).max(2_147_483_647)) }).parse(raw);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Batch" WHERE "id" = ${input.batchId} FOR UPDATE`;
    const batch = await tx.batch.findUniqueOrThrow({ where: { id: input.batchId }, include: { rate: true, variant: true } });
    if (batch.landedCostMmk != null || batch.landedCostVnd != null) throw new Error("Lô đã có giá vốn thực tế; không thay bằng giá vốn tạm");
    if (batch.unitCostVnd == null) throw new Error("Chỉ tính vốn tạm cho lô mua bằng VND");
    const posted = await tx.stockDocumentLine.findFirst({ where: { batchId: batch.id, document: { type: "RECEIVE", status: "POSTED" } }, select: { id: true } });
    if (!posted) throw new Error("Lô chưa có phiếu nhập đã ghi sổ");
    const rate = batch.rate ?? await latestRate(tx);
    if (!rate) throw new Error("Cần tạo tỷ giá trước khi tính giá vốn tạm");
    const weight = batch.variant.weightGrams;
    if (weight == null || weight <= 0) throw new Error("Cần nhập khối lượng sản phẩm trước khi tính giá vốn tạm");
    const estimatedCostMmk = convertVndToMmk(batch.unitCostVnd, rate) + shippingMmk(input.shipMmkPerKg, weight);
    if (!Number.isSafeInteger(estimatedCostMmk) || estimatedCostMmk > 2_147_483_647) throw new Error("Giá vốn tạm tính vượt giới hạn");
    await tx.batch.update({ where: { id: batch.id }, data: {
      rateId: rate.id, estimatedCostMmk, estimatedShipMmkPerKg: input.shipMmkPerKg, estimatedWeightGrams: weight,
    } });
    await tx.auditLog.create({ data: { userId, action: "batch.estimate", entity: "Batch", entityId: batch.id, data: {
      before: batch.estimatedCostMmk, estimatedCostMmk, shipMmkPerKg: input.shipMmkPerKg, weightGrams: weight, rateId: rate.id,
    } } });
    return estimatedCostMmk;
  });
}
