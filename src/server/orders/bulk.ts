import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rawId } from "@/lib/schemas";
import { can } from "@/server/auth/roles";
import { OrderError } from "./errors";
import { TRANSITIONS } from "./state-machine";
import { transitionOrder, type Actor } from "./transitions";

/**
 * DT: chuyển trạng thái nhiều đơn một lần. Mỗi đơn vẫn đi qua `transitionOrder` (khoá FOR UPDATE, state machine,
 * xuất kho FEFO khi bàn giao) trong transaction RIÊNG → một đơn lỗi không kéo đơn khác; trả kết quả từng đơn.
 * Không có huỷ / xác nhận chuyển khoản hàng loạt: hai việc này cần xem từng đơn.
 */
export const BULK_TRANSITIONS = ["confirmCod", "ship", "complete"] as const;
export type BulkTransition = (typeof BULK_TRANSITIONS)[number];
export const BULK_MAX = 100;

export const bulkSchema = z.object({
  transition: z.enum(BULK_TRANSITIONS),
  ids: z
    .array(rawId)
    .min(1)
    .max(BULK_MAX)
    .refine((ids) => new Set(ids).size === ids.length, "Danh sách có đơn trùng"),
  carrier: z.string().trim().min(1).max(100).optional(),
});

/** Kết quả trả về form hàng loạt (Server Action). */
export type BulkState = { error?: string; done?: number; total?: number; failed?: { code: string; message: string }[] } | undefined;

export type BulkResult = { id: string; code: string; ok: true } | { id: string; code: string; ok: false; error: unknown };

export async function bulkTransition(raw: unknown, actor: Extract<Actor, { userId: string }>): Promise<BulkResult[]> {
  const input = bulkSchema.parse(raw);
  if (!can(actor.role, TRANSITIONS[input.transition].permission)) throw new OrderError("forbidden", "Không có quyền thực hiện thao tác này");
  const orders = await prisma.order.findMany({ where: { id: { in: input.ids } }, select: { id: true, code: true } });
  const codeById = new Map(orders.map((o) => [o.id, o.code]));
  const extra = input.transition === "ship" ? { carrier: input.carrier ?? "VTP" } : {};
  const results: BulkResult[] = [];
  // Tuần tự theo thứ tự đã chọn: các đơn bàn giao cùng lúc tranh cùng lô FEFO → không chạy song song.
  for (const id of input.ids) {
    const code = codeById.get(id);
    if (!code) {
      results.push({ id, code: id, ok: false, error: new OrderError("not_found", "Không tìm thấy đơn") });
      continue;
    }
    try {
      await transitionOrder(id, input.transition, actor, extra);
      results.push({ id, code, ok: true });
    } catch (error) {
      results.push({ id, code, ok: false, error });
    }
  }
  return results;
}
