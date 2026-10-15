import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { DocType, StockType } from "@/generated/prisma/client";
import { newCode } from "@/server/codes";
import { getNumberSetting } from "@/server/settings";
import { pickFefo } from "./fefo";
import { applyMoves, type StockMove, type Tx } from "./ledger";

/**
 * Phiếu kho: tạo NHÁP → GHI SỔ (POSTED, sinh ledger) hoặc HUỶ (chỉ khi còn nháp).
 * Đây là cách DUY NHẤT để thay đổi tồn kho từ giao diện.
 */

const PREFIX: Record<DocType, string> = { RECEIVE: "RC", TRANSFER: "TF", ISSUE: "IS", ADJUST: "AJ", RETURN: "RT" };

const id = z.string().min(1);
const qty = z.coerce.number().int().positive();
const stockType = z.enum(["SELLABLE", "TESTER"]).default("SELLABLE");
const day = z.coerce.date();

export const receiveSchema = z.object({
  type: z.literal("RECEIVE"),
  toId: id,
  shipmentId: id.optional(),
  reason: z.string().max(500).optional(),
  lines: z
    .array(
      z.object({
        variantId: id,
        lotNo: z.string().trim().min(1).max(50),
        expiryDate: day,
        mfgDate: day.optional(),
        unitCostVnd: z.coerce.number().int().min(0),
        qty,
        stockType,
      }),
    )
    .min(1),
});

export const transferSchema = z.object({
  type: z.literal("TRANSFER"),
  fromId: id,
  toId: id,
  reason: z.string().max(500).optional(),
  lines: z.array(z.object({ variantId: id, batchId: id.optional(), qty, stockType })).min(1),
});

export const issueSchema = z.object({
  type: z.literal("ISSUE"),
  fromId: id,
  reason: z.string().trim().min(1).max(500),
  lines: z.array(z.object({ variantId: id, batchId: id.optional(), qty, stockType })).min(1),
});

export const adjustSchema = z.object({
  type: z.literal("ADJUST"),
  toId: id,
  reason: z.string().trim().min(1).max(500),
  lines: z
    .array(
      z.object({
        variantId: id,
        batchId: id,
        qty: z.coerce.number().int().refine((n) => n !== 0, "Số lượng điều chỉnh khác 0"),
        stockType,
      }),
    )
    .min(1),
});

export const returnSchema = z.object({
  type: z.literal("RETURN"),
  toId: id,
  orderId: id.optional(),
  reason: z.string().trim().min(1).max(500),
  lines: z.array(z.object({ variantId: id, batchId: id, qty, stockType })).min(1),
});

export const documentSchema = z.discriminatedUnion("type", [
  receiveSchema,
  transferSchema,
  issueSchema,
  adjustSchema,
  returnSchema,
]);
export type DocumentInput = z.infer<typeof documentSchema>;

export class DocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentError";
  }
}

async function assertLocation(tx: Tx, locationId: string) {
  const loc = await tx.location.findUnique({ where: { id: locationId } });
  if (!loc) throw new DocumentError("Vị trí kho không tồn tại");
  return loc;
}

async function assertBatch(tx: Tx, batchId: string, variantId: string) {
  const b = await tx.batch.findUnique({ where: { id: batchId } });
  if (!b || b.variantId !== variantId) throw new DocumentError("Lô không thuộc biến thể đã chọn");
}

/** Tạo phiếu NHÁP. RECEIVE tạo (hoặc dùng lại) lô theo (biến thể, số lô). */
export async function createDocument(raw: unknown, userId: string) {
  const input = documentSchema.parse(raw);

  return prisma.$transaction(async (tx) => {
    const fromId = "fromId" in input ? input.fromId : undefined;
    const toId = "toId" in input ? input.toId : undefined;
    if (fromId) await assertLocation(tx, fromId);
    if (toId) {
      const to = await assertLocation(tx, toId);
      if (input.type === "RETURN" && to.type !== "QUARANTINE") {
        throw new DocumentError("Hàng trả phải nhập vào vị trí Chờ kiểm tra");
      }
    }
    if (fromId && toId && fromId === toId) throw new DocumentError("Vị trí đi và đến phải khác nhau");

    const lines: { variantId: string; batchId: string | null; stockType: StockType; qty: number }[] = [];

    if (input.type === "RECEIVE") {
      for (const l of input.lines) {
        const variant = await tx.variant.findUnique({ where: { id: l.variantId } });
        if (!variant) throw new DocumentError("Biến thể không tồn tại");
        if (variant.isBundle) throw new DocumentError("Không nhập kho trực tiếp cho combo — nhập từng thành phần");
        const existing = await tx.batch.findUnique({
          where: { variantId_lotNo: { variantId: l.variantId, lotNo: l.lotNo } },
        });
        if (existing && existing.expiryDate.getTime() !== l.expiryDate.getTime()) {
          throw new DocumentError(`Lô ${l.lotNo} đã có với hạn dùng khác`);
        }
        const batch =
          existing ??
          (await tx.batch.create({
            data: {
              variantId: l.variantId,
              lotNo: l.lotNo,
              expiryDate: l.expiryDate,
              mfgDate: l.mfgDate,
              unitCostVnd: l.unitCostVnd,
              shipmentId: input.shipmentId,
            },
          }));
        lines.push({ variantId: l.variantId, batchId: batch.id, stockType: l.stockType, qty: l.qty });
      }
    } else {
      for (const l of input.lines) {
        if (l.batchId) await assertBatch(tx, l.batchId, l.variantId);
        lines.push({ variantId: l.variantId, batchId: l.batchId ?? null, stockType: l.stockType, qty: l.qty });
      }
    }

    return tx.stockDocument.create({
      data: {
        code: newCode(PREFIX[input.type]),
        type: input.type,
        status: "DRAFT",
        fromId,
        toId,
        shipmentId: input.type === "RECEIVE" ? input.shipmentId : undefined,
        orderId: input.type === "RETURN" ? input.orderId : undefined,
        reason: input.reason,
        createdById: userId,
        lines: { create: lines },
      },
    });
  });
}

/** Tồn khả dụng theo lô của một biến thể tại một vị trí (dùng cho FEFO). */
export async function candidatesAt(tx: Tx, variantId: string, locationId: string, stockType: StockType) {
  const balances = await tx.stockBalance.findMany({
    where: { locationId, stockType, qty: { gt: 0 }, batch: { variantId } },
    include: { batch: true },
  });
  return balances.map((b) => ({
    batchId: b.batchId,
    expiryDate: b.batch.expiryDate,
    receivedAt: b.batch.createdAt,
    available: b.qty,
  }));
}

/** GHI SỔ: chọn lô FEFO cho dòng chưa có lô, sinh ledger, khoá phiếu. */
export async function postDocument(documentId: string, userId: string) {
  return prisma.$transaction((tx) => postDocumentTx(tx, documentId, userId), { maxWait: 10_000, timeout: 30_000 });
}

/**
 * Ghi sổ trong transaction có sẵn (đóng gói đơn: đổi trạng thái đơn + trừ kho cùng một transaction).
 * `blockDays`: ngưỡng hạn dùng khi tự chọn lô — xuất nội bộ 0, bán hàng dùng `salesBlockDays()`.
 */
export async function postDocumentTx(tx: Tx, documentId: string, userId: string, opts: { blockDays?: number } = {}) {
  // Chuyển trạng thái nguyên tử: chỉ một request ghi sổ được.
  const claimed = await tx.stockDocument.updateMany({
    where: { id: documentId, status: "DRAFT" },
    data: { status: "POSTED", postedById: userId, postedAt: new Date() },
  });
  if (claimed.count !== 1) throw new DocumentError("Phiếu không ở trạng thái nháp");

  const doc = await tx.stockDocument.findUniqueOrThrow({ where: { id: documentId }, include: { lines: true } });
  const today = new Date();

  // Dòng chưa chọn lô (chuyển/xuất) → FEFO tại vị trí đi. Xuất nội bộ mặc định dùng cả lô cận hạn (blockDays = 0).
  const resolved: { variantId: string; batchId: string; stockType: StockType; qty: number }[] = [];
  for (const line of doc.lines) {
    if (line.batchId) {
      resolved.push({ ...line, batchId: line.batchId });
      continue;
    }
    if (!doc.fromId) throw new DocumentError("Thiếu vị trí xuất");
    const picks = pickFefo(await candidatesAt(tx, line.variantId, doc.fromId, line.stockType), line.qty, {
      today,
      blockDays: opts.blockDays ?? 0,
    });
    await tx.stockDocumentLine.delete({ where: { id: line.id } });
    for (const p of picks) {
      await tx.stockDocumentLine.create({
        data: { documentId, variantId: line.variantId, batchId: p.batchId, stockType: line.stockType, qty: p.qty },
      });
      resolved.push({ variantId: line.variantId, batchId: p.batchId, stockType: line.stockType, qty: p.qty });
    }
  }

  const moves: StockMove[] = [];
  for (const l of resolved) {
    const base = { batchId: l.batchId, stockType: l.stockType };
    switch (doc.type) {
      case "RECEIVE":
      case "RETURN":
        moves.push({ ...base, locationId: doc.toId!, qtyDelta: l.qty });
        break;
      case "TRANSFER":
        moves.push({ ...base, locationId: doc.fromId!, qtyDelta: -l.qty });
        moves.push({ ...base, locationId: doc.toId!, qtyDelta: l.qty });
        break;
      case "ISSUE":
        moves.push({ ...base, locationId: doc.fromId!, qtyDelta: -l.qty });
        break;
      case "ADJUST":
        moves.push({ ...base, locationId: doc.toId!, qtyDelta: l.qty });
        break;
    }
  }
  await applyMoves(tx, documentId, userId, moves);

  // Nhận hàng: gắn tỷ giá hiện hành vào lô (dùng tính giá vốn MMK).
  if (doc.type === "RECEIVE") {
    const rate = await tx.exchangeRate.findFirst({ orderBy: { effectiveAt: "desc" } });
    if (rate) {
      await tx.batch.updateMany({
        where: { id: { in: resolved.map((r) => r.batchId) }, rateId: null },
        data: { rateId: rate.id },
      });
    }
  }

  await tx.auditLog.create({
    data: { userId, action: "stock.post", entity: "StockDocument", entityId: documentId, data: { code: doc.code } },
  });
  return doc.code;
}

export async function cancelDocument(documentId: string, userId: string) {
  const res = await prisma.stockDocument.updateMany({
    where: { id: documentId, status: "DRAFT" },
    data: { status: "CANCELLED" },
  });
  if (res.count !== 1) throw new DocumentError("Chỉ huỷ được phiếu nháp");
  await prisma.auditLog.create({
    data: { userId, action: "stock.cancel", entity: "StockDocument", entityId: documentId },
  });
}

/** Ngưỡng hạn dùng cho bán hàng (dùng ở P2). */
export async function salesBlockDays() {
  return getNumberSetting("expiry.blockDays");
}
