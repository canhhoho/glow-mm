import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/server/inventory/ledger";
import { expandBundles } from "@/server/inventory/bundle";
import { baseAvailability, bundleDefs, type AvailabilityOpts } from "./availability";
import { OrderError } from "./errors";

/**
 * Giữ hàng ở cấp biến thể. Combo được giữ trên từng biến thể thành phần.
 * Chống bán vượt: khoá dòng Variant (SELECT … FOR UPDATE, theo thứ tự id) trước khi đọc khả dụng,
 * nên hai đơn đồng thời cho cùng biến thể sẽ chạy tuần tự.
 */

export async function lockVariants(tx: Tx, variantIds: string[]) {
  const ids = [...new Set(variantIds)].sort();
  if (ids.length === 0) return;
  await tx.$queryRaw`SELECT "id" FROM "Variant" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`;
}

/** Nhu cầu theo biến thể thành phần (combo đã được mở rộng). */
export async function componentNeeds(tx: Tx, items: { variantId: string; qty: number }[]) {
  const defs = await bundleDefs(tx, items.map((i) => i.variantId));
  return expandBundles(items, defs);
}

/** Khoá + kiểm tra đủ hàng cho nhu cầu; ném OrderError("out_of_stock") nếu thiếu. */
export async function assertAvailable(tx: Tx, need: Map<string, number>, opts: AvailabilityOpts) {
  await lockVariants(tx, [...need.keys()]);
  const avail = await baseAvailability(tx, [...need.keys()], opts);
  const short = [...need].filter(([id, q]) => (avail.get(id) ?? 0) < q);
  if (short.length > 0) {
    throw new OrderError("out_of_stock", "Không đủ hàng", {
      variants: short.map(([id, q]) => ({ variantId: id, requested: q, available: Math.max(0, avail.get(id) ?? 0) })),
    });
  }
}

export async function reserveForOrder(
  tx: Tx,
  input: { orderId: string; items: { variantId: string; qty: number }[]; expiresAt: Date | null },
  opts: AvailabilityOpts,
) {
  const need = await componentNeeds(tx, input.items);
  await assertAvailable(tx, need, opts);
  await tx.reservation.createMany({
    data: [...need].map(([variantId, qty]) => ({ orderId: input.orderId, variantId, qty, expiresAt: input.expiresAt })),
  });
}

/**
 * Giữ hàng không thời hạn (đã xác nhận COD / đã có biên lai / đã duyệt thanh toán).
 * Nếu giữ hàng đã quá hạn mà cron chưa kịp nhả → kiểm tra lại tồn trước khi giữ tiếp.
 */
export async function holdIndefinitely(tx: Tx, orderId: string, opts: AvailabilityOpts) {
  const active = await tx.reservation.findMany({ where: { orderId, status: "ACTIVE" } });
  const expired = active.filter((r) => r.expiresAt && r.expiresAt <= opts.now);
  if (expired.length > 0) {
    await assertAvailable(tx, new Map(expired.map((r) => [r.variantId, r.qty])), opts);
  }
  await tx.reservation.updateMany({ where: { orderId, status: "ACTIVE" }, data: { expiresAt: null } });
}

export async function releaseReservations(tx: Tx, orderId: string) {
  await tx.reservation.updateMany({ where: { orderId, status: "ACTIVE" }, data: { status: "RELEASED" } });
}
