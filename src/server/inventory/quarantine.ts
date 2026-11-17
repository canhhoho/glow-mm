import "server-only";
import { z } from "zod";
import { mmTextReq, rawId } from "@/lib/schemas";
import { prisma } from "@/lib/db";
import { cancelDocument, createDocument, DocumentError, postDocument } from "./documents";
import { productName } from "./queries";

/**
 * Khu "Chờ kiểm tra" (vị trí QUARANTINE): hàng khách trả về nằm đây đến khi kiểm tra xong.
 *  - Nhập lại kho bán = phiếu TRANSFER sang vị trí bán được.
 *  - Huỷ = phiếu ISSUE có lý do.
 * Đều đi qua phiếu kho → ledger như mọi thay đổi tồn khác.
 */

export async function listQuarantine() {
  const rows = await prisma.stockBalance.findMany({
    where: { qty: { gt: 0 }, location: { type: "QUARANTINE" } },
    include: {
      location: true,
      batch: { include: { variant: { include: { product: { include: { translations: true, stockLocation: { select: { name: true } } } } } } } },
    },
    orderBy: [{ batch: { variant: { sku: "asc" } } }, { batch: { expiryDate: "asc" } }],
  });
  // Đơn gốc: các phiếu RETURN đã ghi sổ có lô này vào vị trí này.
  const returns = await prisma.stockDocumentLine.findMany({
    where: {
      batchId: { in: rows.map((r) => r.batchId) },
      document: { type: "RETURN", status: "POSTED", toId: { in: rows.map((r) => r.locationId) } },
    },
    select: { batchId: true, document: { select: { toId: true, order: { select: { id: true, code: true } } } } },
    orderBy: { document: { postedAt: "desc" } },
  });

  return rows.map((r) => {
    const orders = new Map<string, string>();
    for (const l of returns) {
      if (l.batchId === r.batchId && l.document.toId === r.locationId && l.document.order) {
        orders.set(l.document.order.id, l.document.order.code);
      }
    }
    return {
      batchId: r.batchId,
      locationId: r.locationId,
      location: r.location.code,
      locationName: r.location.name,
      locationActive: r.location.active,
      stockType: r.stockType,
      variantId: r.batch.variantId,
      sku: r.batch.variant.sku,
      name: `${productName(r.batch.variant.product.translations, r.batch.variant.product.slug)} (${r.batch.variant.label})`,
      lotNo: r.batch.lotNo,
      expiryDate: r.batch.expiryDate,
      expiryStatus: r.batch.expiryStatus,
      qty: r.qty,
      /** Kho bán của SP — nơi nhập lại sau kiểm tra (P24). */
      warehouse: r.batch.variant.product.stockLocation?.name ?? null,
      orders: [...orders].map(([id, code]) => ({ id, code })),
    };
  });
}

const base = z.object({
  batchId: rawId,
  fromId: rawId,
  qty: z.coerce.number().int().positive(),
  stockType: z.enum(["SELLABLE", "TESTER"]).default("SELLABLE"),
});

/** `toId` bỏ trống = kho bán của SP (P24: nhập lại chỉ được vào đúng kho của SP). */
export const restockSchema = base.extend({ toId: z.preprocess((v) => (v === "" || v == null ? undefined : v), rawId.optional()) });
export const discardSchema = base.extend({ reason: mmTextReq(500) });

async function assertQuarantine(fromId: string) {
  const loc = await prisma.location.findUnique({ where: { id: fromId } });
  if (loc?.type !== "QUARANTINE") throw new DocumentError("Chỉ xử lý hàng ở vị trí Chờ kiểm tra");
}

/** Tạo phiếu rồi ghi sổ ngay; ghi sổ lỗi thì huỷ nháp để không còn phiếu treo. */
async function createAndPost(raw: unknown, userId: string) {
  const doc = await createDocument(raw, userId);
  try {
    await postDocument(doc.id, userId);
  } catch (e) {
    await cancelDocument(doc.id, userId);
    throw e;
  }
  return doc;
}

export async function restockFromQuarantine(raw: unknown, userId: string) {
  const input = restockSchema.parse(raw);
  await assertQuarantine(input.fromId);
  const batch = await prisma.batch.findUniqueOrThrow({
    where: { id: input.batchId },
    include: { variant: { select: { product: { select: { stockLocationId: true } } } } },
  });
  const toId = input.toId ?? batch.variant.product.stockLocationId;
  if (!toId) throw new DocumentError("Sản phẩm chưa có kho bán — chọn kho nhập lại");
  const to = await prisma.location.findUnique({ where: { id: toId } });
  if (!to?.sellable) throw new DocumentError("Phải nhập lại vào vị trí bán được");
  return createAndPost(
    {
      type: "TRANSFER",
      fromId: input.fromId,
      toId,
      reason: "Hàng trả đạt kiểm tra — nhập lại kho bán",
      lines: [{ variantId: batch.variantId, batchId: batch.id, qty: input.qty, stockType: input.stockType }],
    },
    userId,
  );
}

export async function discardFromQuarantine(raw: unknown, userId: string) {
  const input = discardSchema.parse(raw);
  await assertQuarantine(input.fromId);
  const batch = await prisma.batch.findUniqueOrThrow({ where: { id: input.batchId } });
  return createAndPost(
    {
      type: "ISSUE",
      fromId: input.fromId,
      reason: `Huỷ hàng trả: ${input.reason}`,
      lines: [{ variantId: batch.variantId, batchId: batch.id, qty: input.qty, stockType: input.stockType }],
    },
    userId,
  );
}
