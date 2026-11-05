import "server-only";
import { analyticsConfig } from "@/lib/env";
import type { Tx } from "@/server/inventory/ledger";
import { analyticsContextSchema } from "./schema";

type BusinessEvent = "purchase" | "order_confirmed" | "order_shipped" | "order_completed" | "order_cancelled" | "refund";
type OrderInfo = { id: string; locale: string; channel: string; totalMmk: number };

/** Trong cùng transaction với đơn: sự kiện chỉ tồn tại khi thao tác nghiệp vụ thành công. */
export async function recordOrderEvent(tx: Tx, name: BusinessEvent, order: OrderInfo, opts: { context?: unknown; reference?: string; valueMmk?: number } = {}) {
  if (!analyticsConfig().ANALYTICS_ENABLED) return;
  const context = analyticsContextSchema.safeParse(opts.context);
  const purchase = name === "purchase" ? null : await tx.analyticsEvent.findUnique({ where: { dedupeKey: `purchase:${order.id}` }, select: { sessionId: true, device: true } });
  const sessionId = context.success ? context.data.sessionId : purchase?.sessionId ?? `order:${order.id}`;
  const device = context.success ? context.data.device : purchase?.device ?? null;
  const dedupeKey = `${name}:${opts.reference ?? order.id}`;
  await tx.analyticsEvent.upsert({ where: { dedupeKey }, update: {}, create: {
    name, sessionId, device, locale: order.locale, path: "/order/:order", orderId: order.id, dedupeKey,
    props: { value: opts.valueMmk ?? order.totalMmk, currency: "MMK", channel: order.channel },
  } });
}
