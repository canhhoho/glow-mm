import "server-only";
import type { Tx } from "@/server/inventory/ledger";
import { expandBundles } from "@/server/inventory/bundle";
import { getNumberSetting } from "@/server/settings";
import { baseAvailability, bundleDefs, type AvailabilityOpts } from "./availability";
import { OrderError } from "./errors";
import { componentNeeds, lockVariants } from "./reservations";

/**
 * QT3 — đặt trước khi hết hàng (docs/ke-hoach-quy-trinh-san-pham.md).
 * - SP bật `preorderEnabled` (mặc định bật), biến thể thường (không phải combo), đang bán + SP đang hiển thị.
 * - Hạn mức theo biến thể: `Variant.preorderLimit` hoặc cài đặt `preorder.defaultLimit`, trừ tổng SL của các đơn
 *   đang `AWAITING_STOCK`.
 * - Đơn có bất kỳ dòng nào thiếu hàng (và dòng đó đặt trước được) → cả đơn là đơn đặt trước, KHÔNG giữ hàng;
 *   khi hàng về admin chuyển sang PENDING (`stockArrived`) mới giữ hàng như đơn thường.
 */

/** Số cái còn nhận đặt trước theo biến thể (0 = không nhận: combo, SP tắt đặt trước, hết hạn mức…). */
export async function preorderCapacity(db: Tx, variantIds: string[]): Promise<Map<string, number>> {
  const ids = [...new Set(variantIds)];
  const result = new Map<string, number>(ids.map((id) => [id, 0]));
  if (ids.length === 0) return result;
  const [defaultLimit, variants, waiting] = await Promise.all([
    getNumberSetting("preorder.defaultLimit"),
    db.variant.findMany({
      where: { id: { in: ids }, isBundle: false, active: true, product: { published: true, archivedAt: null, preorderEnabled: true } },
      select: { id: true, preorderLimit: true },
    }),
    db.orderItem.groupBy({ by: ["variantId"], where: { variantId: { in: ids }, order: { status: "AWAITING_STOCK" } }, _sum: { qty: true } }),
  ]);
  const used = new Map(waiting.map((w) => [w.variantId, w._sum.qty ?? 0]));
  for (const v of variants) result.set(v.id, Math.max(0, (v.preorderLimit ?? defaultLimit) - (used.get(v.id) ?? 0)));
  return result;
}

/**
 * Trước khi tạo đơn: khoá biến thể, kiểm tồn. Đủ hàng → đơn thường (`preorder: false`, gọi `reserveForOrder` sau).
 * Thiếu hàng ở dòng nào thì dòng đó phải đặt trước được (đủ hạn mức) → `preorder: true`; không thì `out_of_stock`.
 * Khoá dòng Variant (cả biến thể của đơn lẫn thành phần combo) → hai đơn tranh hạn mức cuối chạy tuần tự.
 * 19/11/2026: áp cho MỌI đơn (khách web, nhân viên, CTV tạo tay) — trước đây đơn tạo tay thiếu hàng luôn `out_of_stock`.
 */
export async function planOrderStock(
  tx: Tx,
  items: { variantId: string; qty: number }[],
  opts: AvailabilityOpts,
): Promise<{ preorder: boolean }> {
  const need = await componentNeeds(tx, items);
  await lockVariants(tx, [...need.keys(), ...items.map((i) => i.variantId)]);
  const avail = await baseAvailability(tx, [...need.keys()], opts);
  const short = new Set([...need].filter(([id, q]) => (avail.get(id) ?? 0) < q).map(([id]) => id));
  if (short.size === 0) return { preorder: false };
  // Dòng thiếu hàng: biến thể thường thiếu, hoặc combo có thành phần thiếu (combo không đặt trước được → capacity 0).
  const defs = await bundleDefs(tx, items.map((i) => i.variantId));
  const partsOf = (variantId: string) => defs.get(variantId)?.map((c) => c.componentId) ?? [variantId];
  const capacity = await preorderCapacity(tx, items.map((i) => i.variantId));
  const blocked = items.filter((i) => partsOf(i.variantId).some((id) => short.has(id)) && (capacity.get(i.variantId) ?? 0) < i.qty);
  if (blocked.length > 0) {
    throw new OrderError("out_of_stock", "Không đủ hàng", {
      variants: blocked.map((i) => ({ variantId: i.variantId, requested: i.qty, available: Math.max(0, avail.get(i.variantId) ?? 0), preorder: capacity.get(i.variantId) ?? 0 })),
    });
  }
  return { preorder: true };
}

/**
 * Danh sách chờ hàng về (trang "Đơn đặt trước"): đơn AWAITING_STOCK theo thứ tự đặt; mô phỏng chia tồn khả dụng
 * hiện tại theo thứ tự đó (FIFO) để báo đơn nào đã đủ hàng. Chỉ đọc — giữ hàng thật xảy ra khi bấm `stockArrived`.
 */
export async function preorderQueue(db: Tx, opts: AvailabilityOpts) {
  const orders = await db.order.findMany({
    where: { status: "AWAITING_STOCK" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      code: true,
      createdAt: true,
      recipientName: true,
      recipientPhone: true,
      paymentMethod: true,
      paymentStatus: true,
      totalMmk: true,
      items: { select: { id: true, variantId: true, sku: true, name: true, qty: true } },
    },
  });
  const variantIds = [...new Set(orders.flatMap((o) => o.items.map((i) => i.variantId)))];
  const defs = await bundleDefs(db, variantIds);
  const baseIds = new Set(variantIds.filter((id) => !defs.has(id)));
  for (const d of defs.values()) for (const c of d) baseIds.add(c.componentId);
  const remaining = await baseAvailability(db, [...baseIds], opts);
  return orders.map((o) => {
    const need = expandBundles(o.items, defs);
    const enough = [...need].every(([id, q]) => (remaining.get(id) ?? 0) >= q);
    // Đơn đủ hàng "giữ chỗ" trong mô phỏng → đơn sau không được tính trùng phần hàng đó.
    if (enough) for (const [id, q] of need) remaining.set(id, (remaining.get(id) ?? 0) - q);
    const lineShort = (variantId: string, qty: number) =>
      enough ? 0 : Math.max(0, ...[...expandBundles([{ variantId, qty }], defs)].map(([id, q]) => q - Math.max(0, remaining.get(id) ?? 0)));
    return { ...o, enough, items: o.items.map((i) => ({ ...i, short: lineShort(i.variantId, i.qty) })) };
  });
}
