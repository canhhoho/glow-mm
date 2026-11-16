import "server-only";
import { recordOrderEvent } from "@/server/analytics/record";
import { z } from "zod";
import { rawId } from "@/lib/schemas";
import { prisma } from "@/lib/db";
import { can, type Role } from "@/server/auth/roles";
import { postDocumentTx, salesBlockDays } from "@/server/inventory/documents";
import { inventoryCost } from "@/server/inventory/cost";
import { InsufficientStockError } from "@/server/inventory/fefo";
import { getBoolSetting, getNumberSetting } from "@/server/settings";
import type { Tx } from "@/server/inventory/ledger";
import { newCode } from "@/server/codes";
import { OrderError } from "./errors";
import { allocateFefo, manifestPicks, orderNeeds } from "./picking";
import { holdIndefinitely, releaseReservations, reserveForOrder } from "./reservations";
import { assertTransition, TRANSITIONS, TransitionError, type TransitionName } from "./state-machine";

/**
 * Thực thi chuyển trạng thái đơn (kèm tác động kho/thanh toán) — luôn đi qua `assertTransition`.
 * Khoá dòng Order (SELECT … FOR UPDATE) để hai thao tác đồng thời không chồng nhau.
 */

/** Nhân viên (kiểm quyền theo bảng TRANSITIONS) hoặc hệ thống (cron — chỉ được huỷ). */
export type Actor = { userId: string; role: Role } | { system: true };

export const transitionExtraSchema = z.object({
  note: z.string().trim().max(500).optional(),
  reason: z.string().trim().max(500).optional(),
  carrier: z.string().trim().min(1).max(100).optional(),
  trackingNo: z.string().trim().max(100).optional(),
  fromLocationId: rawId.optional(),
});
export type TransitionExtra = z.input<typeof transitionExtraSchema>;

/** `now`: mặc định thời điểm hiện tại (truyền vào để tạo dữ liệu mẫu theo ngày). */
export async function transitionOrder(
  orderId: string,
  name: TransitionName,
  actor: Actor,
  extra: TransitionExtra = {},
  now = new Date(),
) {
  const blockDays = await salesBlockDays();
  return prisma.$transaction((tx) => transitionInTx(tx, orderId, name, actor, extra, { now, blockDays }), {
    maxWait: 10_000,
    timeout: 30_000,
  });
}

export async function transitionInTx(
  tx: Tx,
  orderId: string,
  name: TransitionName,
  actor: Actor,
  rawExtra: TransitionExtra,
  opts: { now: Date; blockDays: number; viaReturn?: boolean },
) {
  const extra = transitionExtraSchema.parse(rawExtra);
  const userId = "system" in actor ? null : actor.userId;
  if ("system" in actor ? name !== "cancel" : !can(actor.role, TRANSITIONS[name].permission)) {
    throw new OrderError("forbidden", "Không có quyền thực hiện thao tác này");
  }
  if (name === "returned" && !opts.viaReturn) {
    // Chỉ chuyển RETURNED qua returnItems() (src/server/orders/returns.ts) — luôn kèm phiếu nhập hàng trả vào kho.
    throw new OrderError("invalid_transition", "Dùng chức năng Trả hàng để nhập lại hàng");
  }

  await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
  const order = await tx.order.findUnique({ where: { id: orderId } });
  if (!order) throw new OrderError("not_found", "Không tìm thấy đơn");

  let to;
  try {
    to = assertTransition(name, order);
  } catch (e) {
    if (e instanceof TransitionError) throw new OrderError("invalid_transition", e.message);
    throw e;
  }

  const data: Parameters<typeof tx.order.update>[0]["data"] = { status: to };
  switch (name) {
    case "stockArrived": {
      // QT3: hàng về → giữ hàng như đơn mới (kiểm đủ tồn, khoá dòng); thời hạn giữ tính từ lúc chuyển.
      const items = await tx.orderItem.findMany({ where: { orderId: order.id }, select: { variantId: true, qty: true } });
      const hours = await getNumberSetting(order.paymentMethod === "COD" ? "cod.confirmHours" : "reservation.transferHours");
      await reserveForOrder(tx, { orderId: order.id, items, expiresAt: new Date(opts.now.getTime() + hours * 3_600_000) }, opts);
      break;
    }
    case "confirmCod":
      await holdIndefinitely(tx, order.id, opts);
      data.codConfirmedAt = opts.now;
      break;
    case "confirmPayment":
      await holdIndefinitely(tx, order.id, opts);
      data.paymentStatus = "PAID";
      break;
    case "ship":
      if (!userId) throw new OrderError("forbidden", "Thiếu người bàn giao vận chuyển");
      // Đơn PACKING cũ đã xuất kho: không xuất thêm lần nữa.
      if (order.status !== "PACKING") await issueOrderStock(tx, order, userId, extra.fromLocationId, opts);
      await tx.delivery.create({
        data: { orderId: order.id, carrier: extra.carrier ?? "manual", trackingNo: extra.trackingNo || null, shippedAt: opts.now },
      });
      break;
    case "complete":
      if (order.paymentMethod === "COD") {
        data.paymentStatus = "PAID"; // khách đã trả cho hãng vận chuyển, chưa phải tiền về cửa hàng
        data.codCollectedAt = opts.now;
      }
      data.completedAt = opts.now; // mốc tính hạn giữ hoa hồng CTV
      break;
    case "cancel":
      await releaseReservations(tx, order.id);
      data.cancelReason = extra.reason || null;
      break;
  }

  const updated = await tx.order.update({ where: { id: order.id }, data });
  await tx.orderStatusHistory.create({
    data: {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: to,
      userId,
      note: extra.note || extra.reason || null,
      createdAt: opts.now,
    },
  });
  await tx.auditLog.create({
    data: { userId, action: `order.${name}`, entity: "Order", entityId: order.id, data: { code: order.code, from: order.status, to } },
  });
  const event = name === "confirmCod" || name === "confirmPayment" ? "order_confirmed" : name === "ship" ? "order_shipped" : name === "complete" ? "order_completed" : name === "cancel" ? "order_cancelled" : null;
  if (event) await recordOrderEvent(tx, event, updated);
  return updated;
}

/**
 * Xuất kho khi bàn giao: phân lô FEFO (bỏ lô dưới ngưỡng hạn dùng), combo trừ từng thành phần,
 * ghi phiếu xuất (ledger) + OrderAllocation (giá vốn) và chuyển giữ hàng sang CONSUMED.
 * P24: mỗi SP xuất từ kho bán của nó (combo: kho của combo = kho thành phần) → đơn có hàng
 * của nhiều kho sinh một phiếu xuất cho mỗi kho. `fromLocationId` cũ bị bỏ qua.
 */
async function issueOrderStock(
  tx: Tx,
  order: { id: string; code: string },
  userId: string,
  _fromLocationId: string | undefined,
  opts: { now: Date; blockDays: number },
) {
  const needs = await orderNeeds(tx, order.id);
  const locations = await tx.location.findMany({ where: { id: { in: [...new Set(needs.map((n) => n.locationId))] } } });
  if (locations.some((l) => !l.sellable)) throw new OrderError("invalid_transition", "Vị trí xuất phải là kho bán được");

  // D3-lite: có phiếu soạn đã in → xuất đúng lô trên phiếu (lệch → pick_mismatch, in lại); chưa có → FEFO như trước.
  let picks = await manifestPicks(tx, order.id, needs, opts);
  if (!picks) {
    if (await getBoolSetting("orders.requirePickList")) {
      throw new OrderError("pick_required", "Cần in phiếu soạn (chốt lô) trước khi bàn giao");
    }
    try {
      // Tồn theo lô dùng chung cho các dòng cùng biến thể + kho (trừ dần khi phân bổ).
      picks = await allocateFefo(tx, needs, new Map(), opts);
    } catch (e) {
      if (e instanceof InsufficientStockError) {
        throw new OrderError("out_of_stock", `Không đủ hàng còn hạn để xuất kho: ${e.message}`, { variantId: e.variantId });
      }
      throw e;
    }
  }

  // 16/11: chặn bàn giao khi lô sắp xuất THIẾU HOÀN TOÀN giá vốn (lợi nhuận sẽ sai vì vốn = 0); giá vốn tạm vẫn cho
  // bàn giao (báo cáo đánh dấu "tạm tính"). Kiểm trước khi ghi sổ — lỗi thì cả transaction huỷ, tồn không đổi.
  const batches = await tx.batch.findMany({
    where: { id: { in: picks.map((p) => p.batchId) } },
    select: { id: true, lotNo: true, landedCostMmk: true, estimatedCostMmk: true, variant: { select: { sku: true } } },
  });
  const cost = new Map(batches.map((b) => [b.id, inventoryCost(b)]));
  const missing = batches.filter((b) => cost.get(b.id)!.costStatus === "MISSING");
  if (missing.length) {
    const lots = missing.map((b) => ({ sku: b.variant.sku, lotNo: b.lotNo, batchId: b.id }));
    throw new OrderError("cost_missing", `Lô chưa có giá vốn: ${lots.map((l) => `${l.sku} · ${l.lotNo}`).join(", ")}`, { lots });
  }

  for (const loc of locations) {
    const own = picks.filter((p) => p.locationId === loc.id);
    if (own.length === 0) continue;
    const doc = await tx.stockDocument.create({
      data: {
        code: newCode("IS", opts.now),
        type: "ISSUE",
        status: "DRAFT",
        fromId: loc.id,
        orderId: order.id,
        reason: locations.length > 1 ? `Đơn ${order.code} · ${loc.name}` : `Đơn ${order.code}`,
        createdById: userId,
        lines: { create: own.map((p) => ({ variantId: p.variantId, batchId: p.batchId, stockType: "SELLABLE", qty: p.qty })) },
      },
    });
    await postDocumentTx(tx, doc.id, userId);
  }

  await tx.orderAllocation.createMany({
    data: picks.map((p) => ({
      orderItemId: p.orderItemId,
      batchId: p.batchId,
      qty: p.qty,
      unitLandedCostMmk: cost.get(p.batchId)?.unitCostMmk ?? 0,
      costStatus: cost.get(p.batchId)?.costStatus ?? "MISSING",
    })),
  });
  await tx.reservation.updateMany({ where: { orderId: order.id, status: "ACTIVE" }, data: { status: "CONSUMED" } });
}
