import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { rawId } from "@/lib/schemas";
import { can, type Role } from "@/server/auth/roles";
import { candidatesAt, salesBlockDays } from "@/server/inventory/documents";
import { InsufficientStockError, isBatchUsable, pickFefo, type FefoCandidate } from "@/server/inventory/fefo";
import type { Tx } from "@/server/inventory/ledger";
import { bundleDefs } from "./availability";
import { OrderError } from "./errors";

/**
 * D3-lite — phiếu soạn có lô.
 *  - In phiếu: tính lô FEFO bằng đúng quy tắc xuất kho (combo bung thành phần, kho của SP, ngưỡng hạn dùng);
 *    các đơn in cùng lúc dùng chung tồn từng lô, và trừ phần đã nằm trên phiếu soạn chưa bàn giao của đơn khác.
 *  - Chốt khi in → lưu manifest (OrderPick/OrderPickLine). Manifest KHÔNG giữ lô, không đổi tồn bán.
 *  - Bàn giao: có manifest → xuất đúng các dòng đó nếu còn hợp lệ; lệch → báo in lại, không tự đổi lô.
 *    Chưa có manifest → FEFO như trước (trừ khi cài đặt bắt buộc phiếu soạn).
 */

/** Trạng thái đơn được soạn hàng (đã xác nhận, chưa xuất). PACKING cũ đã xuất kho nên không soạn. */
export const PICKABLE_STATUSES = ["PAYMENT_CONFIRMED", "COD_CONFIRMED"] as const;

export type Need = { orderItemId: string; variantId: string; qty: number; locationId: string };
export type PlannedPick = Need & { batchId: string };

/** Nhu cầu xuất của đơn: mỗi dòng (combo → từng thành phần × số lượng) tại kho bán của SP. */
export async function orderNeeds(tx: Tx, orderId: string): Promise<Need[]> {
  const items = await tx.orderItem.findMany({
    where: { orderId },
    orderBy: { id: "asc" },
    include: { variant: { select: { product: { select: { stockLocationId: true } } } } },
  });
  const defs = await bundleDefs(tx, items.map((i) => i.variantId));
  return items.flatMap((i) => {
    const locationId = i.variant.product.stockLocationId;
    // SP chưa có kho bán (chưa nhập hàng) → không có tồn để xuất.
    if (!locationId) throw Object.assign(new InsufficientStockError(i.qty, 0), { variantId: i.variantId });
    const def = defs.get(i.variantId);
    return def
      ? def.map((c) => ({ orderItemId: i.id, variantId: c.componentId, qty: c.qty * i.qty, locationId }))
      : [{ orderItemId: i.id, variantId: i.variantId, qty: i.qty, locationId }];
  });
}

/**
 * Phân lô FEFO cho nhu cầu, dùng `pools` chung (trừ dần). `reserved`: số đã nằm trên phiếu soạn khác (batch|location)
 * → chỉ tính phần còn lại. Thiếu hàng → InsufficientStockError (không xuất/soạn một phần).
 */
export async function allocateFefo(
  tx: Tx,
  needs: Need[],
  pools: Map<string, FefoCandidate[]>,
  opts: { now: Date; blockDays: number; reserved?: Map<string, number> },
): Promise<PlannedPick[]> {
  const picks: PlannedPick[] = [];
  for (const n of needs) {
    const key = `${n.variantId}|${n.locationId}`;
    let pool = pools.get(key);
    if (!pool) {
      pool = (await candidatesAt(tx, n.variantId, n.locationId, "SELLABLE")).map((c) => ({
        ...c,
        available: Math.max(0, c.available - (opts.reserved?.get(`${c.batchId}|${n.locationId}`) ?? 0)),
      }));
      pools.set(key, pool);
    }
    let alloc;
    try {
      alloc = pickFefo(pool, n.qty, { today: opts.now, blockDays: opts.blockDays });
    } catch (e) {
      if (e instanceof InsufficientStockError) e.variantId = n.variantId;
      throw e;
    }
    for (const a of alloc) {
      pool.find((p) => p.batchId === a.batchId)!.available -= a.qty;
      picks.push({ ...n, batchId: a.batchId, qty: a.qty });
    }
  }
  return picks;
}

export type OrderPlan =
  | { orderId: string; status: "PLANNED"; picks: PlannedPick[] }
  | { orderId: string; status: "NOT_CONFIRMED" | "SHORT"; picks: [] };

/** Kế hoạch soạn cho nhiều đơn (thứ tự đã chọn). Chỉ đọc. */
export async function planPicks(tx: Tx, orderIds: string[], opts: { now: Date; blockDays: number }): Promise<OrderPlan[]> {
  const orders = await tx.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, status: true } });
  const status = new Map(orders.map((o) => [o.id, o.status]));
  // Dòng phiếu soạn chưa bàn giao của đơn KHÁC (còn ở bước chuẩn bị giao) → không gợi ý trùng phần hàng đó.
  const others = await tx.orderPickLine.groupBy({
    by: ["batchId", "locationId"],
    where: { orderId: { notIn: orderIds }, pick: { consumedAt: null, order: { status: { in: [...PICKABLE_STATUSES] } } } },
    _sum: { qty: true },
  });
  const reserved = new Map(others.map((o) => [`${o.batchId}|${o.locationId}`, o._sum.qty ?? 0]));
  const pools = new Map<string, FefoCandidate[]>();
  const plans: OrderPlan[] = [];
  for (const orderId of orderIds) {
    const st = status.get(orderId);
    if (!st || !(PICKABLE_STATUSES as readonly string[]).includes(st)) {
      plans.push({ orderId, status: "NOT_CONFIRMED", picks: [] });
      continue;
    }
    // Đơn thiếu hàng không được trừ vào pool chung (thử trên bản sao).
    const trial = new Map([...pools].map(([k, v]) => [k, v.map((c) => ({ ...c }))]));
    try {
      const picks = await allocateFefo(tx, await orderNeeds(tx, orderId), trial, { ...opts, reserved });
      for (const [k, v] of trial) pools.set(k, v);
      plans.push({ orderId, status: "PLANNED", picks });
    } catch (e) {
      if (!(e instanceof InsufficientStockError)) throw e;
      plans.push({ orderId, status: "SHORT", picks: [] });
    }
  }
  return plans;
}

/** Dấu vân tay kế hoạch: phiếu đang xem phải trùng kế hoạch lúc chốt, nếu không → tải lại. */
export function planHash(plans: OrderPlan[]): string {
  const rows = plans
    .flatMap((p) => p.picks.map((x) => [p.orderId, x.orderItemId, x.variantId, x.batchId, x.locationId, x.qty].join("|")))
    .sort();
  return createHash("sha256").update(rows.join("\n")).digest("hex").slice(0, 24);
}

export class PickError extends Error {
  constructor(public readonly code: "stale" | "forbidden" | "nothing") {
    super(code === "stale" ? "Tồn kho vừa thay đổi — tải lại phiếu soạn rồi in lại" : code === "forbidden" ? "Không có quyền" : "Không có đơn nào soạn được");
    this.name = "PickError";
  }
}

const saveSchema = z.object({
  ids: z.array(rawId).min(1).max(100),
  hash: z.string().min(1).max(64),
});

/**
 * Chốt phiếu soạn khi in: tính lại kế hoạch trong transaction (khoá các đơn), phải trùng `hash` của phiếu đang xem.
 * Đơn đã có phiếu chưa bàn giao → thay toàn bộ dòng (in lại). Đơn chưa xác nhận / thiếu hàng → không lưu.
 */
export async function savePickManifests(raw: unknown, actor: { userId: string; role: Role }, now = new Date()) {
  if (!can(actor.role, "orders:ship") && !can(actor.role, "orders:pack")) throw new PickError("forbidden");
  const input = saveSchema.parse(raw);
  const ids = [...new Set(input.ids)];
  const blockDays = await salesBlockDays();
  return prisma.$transaction(
    async (tx) => {
      // Khoá theo thứ tự id cố định để hai người in cùng lúc không chồng nhau.
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" IN (${Prisma.join([...ids].sort())}) ORDER BY "id" FOR UPDATE`;
      const plans = await planPicks(tx, ids, { now, blockDays });
      if (planHash(plans) !== input.hash) throw new PickError("stale");
      const planned = plans.filter((p) => p.status === "PLANNED");
      if (planned.length === 0) throw new PickError("nothing");
      for (const p of planned) {
        await tx.orderPick.deleteMany({ where: { orderId: p.orderId } });
        await tx.orderPick.create({
          data: {
            orderId: p.orderId,
            printedById: actor.userId,
            printedAt: now,
            lines: { create: p.picks.map(({ orderItemId, variantId, batchId, locationId, qty }) => ({ orderItemId, variantId, batchId, locationId, qty })) },
          },
        });
      }
      await tx.auditLog.createMany({
        data: planned.map((p) => ({ userId: actor.userId, action: "order.pick-print", entity: "Order", entityId: p.orderId, data: { lines: p.picks.length } })),
      });
      return { saved: planned.length, skipped: plans.filter((p) => p.status !== "PLANNED").map((p) => ({ orderId: p.orderId, status: p.status })) };
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}

const needKey = (n: { orderItemId: string; variantId: string; locationId: string }) => `${n.orderItemId}|${n.variantId}|${n.locationId}`;

/**
 * Lúc bàn giao (trong transaction xuất kho): đơn có phiếu soạn chưa dùng → trả đúng các dòng lô để xuất.
 * Kiểm tra: nhu cầu đơn không đổi, lô còn đủ hàng tại kho, còn hạn bán. Lệch → OrderError `pick_mismatch`
 * (rollback cả bàn giao) để kho in lại phiếu, không tự đổi lô. Không có phiếu → null.
 */
export async function manifestPicks(tx: Tx, orderId: string, needs: Need[], opts: { now: Date; blockDays: number }): Promise<PlannedPick[] | null> {
  const pick = await tx.orderPick.findUnique({
    where: { orderId },
    include: { lines: { include: { batch: { select: { lotNo: true, expiryDate: true, expiryStatus: true, variant: { select: { sku: true } } } } } } },
  });
  if (!pick || pick.consumedAt) return null;

  const sum = (rows: { orderItemId: string; variantId: string; locationId: string; qty: number }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(needKey(r), (m.get(needKey(r)) ?? 0) + r.qty);
    return m;
  };
  const want = sum(needs);
  const have = sum(pick.lines);
  const sameDemand = want.size === have.size && [...want].every(([k, q]) => have.get(k) === q);
  const problems: { sku: string; lotNo: string; reason: "DEMAND" | "SHORT" | "EXPIRY" }[] = [];
  if (!sameDemand) problems.push({ sku: "", lotNo: "", reason: "DEMAND" });

  if (sameDemand) {
    const batchIds = [...new Set(pick.lines.map((l) => l.batchId))];
    // Khoá số dư các lô trên phiếu trước khi kiểm (ledger cũng khoá khi ghi — cùng transaction).
    await tx.$queryRaw`SELECT "batchId" FROM "StockBalance" WHERE "batchId" IN (${Prisma.join(batchIds)}) AND "stockType" = 'SELLABLE' FOR UPDATE`;
    const balances = await tx.stockBalance.findMany({ where: { batchId: { in: batchIds }, stockType: "SELLABLE" } });
    const onHand = new Map(balances.map((b) => [`${b.batchId}|${b.locationId}`, b.qty]));
    const needed = new Map<string, { qty: number; line: (typeof pick.lines)[number] }>();
    for (const l of pick.lines) {
      const k = `${l.batchId}|${l.locationId}`;
      needed.set(k, { qty: (needed.get(k)?.qty ?? 0) + l.qty, line: l });
    }
    for (const [k, { qty, line }] of needed) {
      const b = line.batch;
      if (!isBatchUsable(b.expiryDate, opts.now, opts.blockDays, b.expiryStatus)) problems.push({ sku: b.variant.sku, lotNo: b.lotNo, reason: "EXPIRY" });
      else if ((onHand.get(k) ?? 0) < qty) problems.push({ sku: b.variant.sku, lotNo: b.lotNo, reason: "SHORT" });
    }
  }
  if (problems.length) {
    const text = problems.map((p) => (p.reason === "DEMAND" ? "đơn đã đổi so với phiếu" : `${p.sku} lô ${p.lotNo}: ${p.reason === "SHORT" ? "không đủ hàng" : "hết hạn bán"}`));
    throw new OrderError("pick_mismatch", `Phiếu soạn không còn khớp (${text.join("; ")}) — in lại phiếu soạn`, { problems });
  }
  await tx.orderPick.update({ where: { orderId }, data: { consumedAt: opts.now } });
  return pick.lines.map(({ orderItemId, variantId, batchId, locationId, qty }) => ({ orderItemId, variantId, batchId, locationId, qty }));
}
