import "server-only";
import type { Prisma, StockType } from "@/generated/prisma/client";

/**
 * Ghi sổ kho. NƠI DUY NHẤT thay đổi StockBalance.
 * Luôn gọi bên trong prisma.$transaction: khoá dòng balance (SELECT … FOR UPDATE),
 * ghi StockLedger (chỉ INSERT) và cập nhật StockBalance; không cho tồn âm.
 */

export type Tx = Prisma.TransactionClient;

export type StockMove = {
  batchId: string;
  locationId: string;
  stockType: StockType;
  qtyDelta: number;
};

export class NegativeStockError extends Error {
  constructor(
    public readonly batchId: string,
    public readonly locationId: string,
    public readonly available: number,
    public readonly delta: number,
  ) {
    super(`Tồn không đủ (lô ${batchId}, vị trí ${locationId}): còn ${available}, cần trừ ${-delta}`);
    this.name = "NegativeStockError";
  }
}

const keyOf = (m: Pick<StockMove, "batchId" | "locationId" | "stockType">) =>
  `${m.batchId}|${m.locationId}|${m.stockType}`;

export async function applyMoves(tx: Tx, documentId: string, userId: string, moves: StockMove[]): Promise<void> {
  if (moves.length === 0) throw new Error("Phiếu không có dòng nào");
  for (const m of moves) {
    if (!Number.isInteger(m.qtyDelta) || m.qtyDelta === 0) throw new Error("Số lượng thay đổi phải là số nguyên khác 0");
  }

  // Gộp theo khoá và khoá dòng theo thứ tự cố định để tránh deadlock.
  const net = new Map<string, StockMove>();
  for (const m of moves) {
    const k = keyOf(m);
    const cur = net.get(k);
    net.set(k, cur ? { ...cur, qtyDelta: cur.qtyDelta + m.qtyDelta } : { ...m });
  }
  const keys = [...net.keys()].sort();

  for (const k of keys) {
    const m = net.get(k)!;
    await tx.$executeRaw`
      INSERT INTO "StockBalance" ("batchId", "locationId", "stockType", "qty")
      VALUES (${m.batchId}, ${m.locationId}, ${m.stockType}::"StockType", 0)
      ON CONFLICT ("batchId", "locationId", "stockType") DO NOTHING`;
    const rows = await tx.$queryRaw<{ qty: number }[]>`
      SELECT "qty" FROM "StockBalance"
      WHERE "batchId" = ${m.batchId} AND "locationId" = ${m.locationId} AND "stockType" = ${m.stockType}::"StockType"
      FOR UPDATE`;
    const current = rows[0]?.qty ?? 0;
    const next = current + m.qtyDelta;
    if (next < 0) throw new NegativeStockError(m.batchId, m.locationId, current, m.qtyDelta);
    await tx.$executeRaw`
      UPDATE "StockBalance" SET "qty" = ${next}
      WHERE "batchId" = ${m.batchId} AND "locationId" = ${m.locationId} AND "stockType" = ${m.stockType}::"StockType"`;
  }

  // Sổ cái giữ từng dòng gốc (không gộp) để truy vết.
  await tx.stockLedger.createMany({
    data: moves.map((m) => ({
      documentId,
      batchId: m.batchId,
      locationId: m.locationId,
      stockType: m.stockType,
      qtyDelta: m.qtyDelta,
      userId,
    })),
  });
}
