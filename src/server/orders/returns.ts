import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { toUnicode } from "@/lib/myanmar";
import { can, type Role } from "@/server/auth/roles";
import { newCode } from "@/server/codes";
import { postDocumentTx, salesBlockDays } from "@/server/inventory/documents";
import type { Tx } from "@/server/inventory/ledger";
import { bundleDefs } from "./availability";
import { OrderError } from "./errors";
import { pickReturnBatches } from "./return-alloc";
import { transitionInTx } from "./transitions";

/**
 * Trả hàng (một phần hoặc toàn bộ) cho đơn đã giao/đang giao:
 * hàng về đúng lô đã xuất → phiếu RETURN vào vị trí "Chờ kiểm tra" (QUARANTINE), cùng transaction.
 * Trả hết mọi dòng → đơn chuyển RETURNED. Kiểm tra xong: nhập lại kho bán hoặc huỷ (src/server/inventory/quarantine.ts).
 */

const id = z.string().min(1);

export const returnSchema = z.object({
  lines: z
    .array(z.object({ orderItemId: id, qty: z.coerce.number().int().min(0).max(999) }))
    .transform((ls) => ls.filter((l) => l.qty > 0))
    .pipe(z.array(z.object({ orderItemId: id, qty: z.number() })).min(1, "Chọn ít nhất một sản phẩm để trả")),
  reason: z.string().trim().min(1).max(500).transform(toUnicode),
  toLocationId: id.optional(),
  refunded: z.coerce.boolean().default(false),
});
export type ReturnInput = z.input<typeof returnSchema>;

export async function returnItems(orderId: string, raw: unknown, actor: { userId: string; role: Role }) {
  const input = returnSchema.parse(raw);
  if (!can(actor.role, "orders:return")) throw new OrderError("forbidden", "Không có quyền trả hàng");
  const blockDays = await salesBlockDays();
  const now = new Date();

  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: { include: { allocations: { orderBy: { id: "asc" }, include: { batch: true } } } } },
      });
      if (!order) throw new OrderError("not_found", "Không tìm thấy đơn");
      if (order.status !== "SHIPPING" && order.status !== "COMPLETED") {
        throw new OrderError("invalid_transition", "Chỉ trả hàng cho đơn đang giao hoặc đã hoàn tất");
      }
      const toId = input.toLocationId ?? (await defaultQuarantine(tx));
      const loc = await tx.location.findUnique({ where: { id: toId } });
      if (loc?.type !== "QUARANTINE") throw new OrderError("invalid_transition", "Hàng trả phải vào vị trí Chờ kiểm tra");

      const defs = await bundleDefs(tx, order.items.map((i) => i.variantId));
      const docLines: { variantId: string; batchId: string; qty: number }[] = [];
      const summary: string[] = [];
      for (const l of input.lines) {
        const item = order.items.find((i) => i.id === l.orderItemId);
        if (!item) throw new OrderError("not_found", "Dòng đơn không thuộc đơn này");
        if (l.qty > item.qty - item.returnedQty) {
          throw new OrderError("invalid_transition", `Trả vượt số đã mua (${item.sku}: còn ${item.qty - item.returnedQty})`);
        }
        // Combo: trả từng thành phần (số bộ × số lượng/bộ); thường: chính biến thể đó.
        const parts = defs.get(item.variantId) ?? [{ componentId: item.variantId, qty: 1 }];
        for (const part of parts) {
          const slices = item.allocations
            .filter((a) => a.batch.variantId === part.componentId)
            .map((a) => ({ batchId: a.batchId, qty: a.qty }));
          for (const pick of pickReturnBatches(slices, item.returnedQty * part.qty, l.qty * part.qty)) {
            docLines.push({ variantId: part.componentId, batchId: pick.batchId, qty: pick.qty });
          }
        }
        await tx.orderItem.update({ where: { id: item.id }, data: { returnedQty: { increment: l.qty } } });
        summary.push(`${item.sku}×${l.qty}`);
      }

      const doc = await tx.stockDocument.create({
        data: {
          code: newCode("RT", now),
          type: "RETURN",
          status: "DRAFT",
          toId,
          orderId: order.id,
          reason: `Đơn ${order.code}: ${input.reason}`,
          createdById: actor.userId,
          lines: { create: docLines.map((d) => ({ ...d, stockType: "SELLABLE" as const })) },
        },
      });
      await postDocumentTx(tx, doc.id, actor.userId);

      const after = await tx.orderItem.findMany({ where: { orderId: order.id }, select: { qty: true, returnedQty: true } });
      const fullyReturned = after.every((i) => i.returnedQty >= i.qty);
      const note = `Trả hàng ${summary.join(", ")} — ${input.reason}${input.refunded ? " (đã hoàn tiền)" : ""}`;
      if (fullyReturned) {
        await transitionInTx(tx, order.id, "returned", actor, { note }, { now, blockDays, viaReturn: true });
        if (input.refunded) await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "REFUNDED" } });
      } else {
        await tx.orderStatusHistory.create({
          data: { orderId: order.id, fromStatus: order.status, toStatus: order.status, userId: actor.userId, note, createdAt: now },
        });
      }
      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: "order.return",
          entity: "Order",
          entityId: order.id,
          data: { code: order.code, document: doc.code, lines: summary, refunded: input.refunded, fullyReturned },
        },
      });
      return { documentId: doc.id, documentCode: doc.code, fullyReturned };
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}

async function defaultQuarantine(tx: Tx) {
  const locs = await tx.location.findMany({ where: { type: "QUARANTINE" }, select: { id: true }, take: 2 });
  if (locs.length !== 1) throw new OrderError("invalid_transition", "Chọn vị trí Chờ kiểm tra");
  return locs[0].id;
}
