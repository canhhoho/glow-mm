import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/events/route";
import { analyticsReport } from "@/server/analytics/queries";
import { createOrder } from "@/server/orders/orders";
import { transitionOrder } from "@/server/orders/transitions";
import { returnItems } from "@/server/orders/returns";
import { cleanupExpired } from "@/server/cron/cleanup";
import { addDays, yangonDayKey, yangonDayStart } from "@/lib/time";
import { admin, orderInput, saleFixture, unpublishTestProducts } from "./fixtures";

afterAll(unpublishTestProducts);
afterEach(() => vi.unstubAllEnvs());
const context = () => ({ sessionId: randomUUID(), device: "mobile" as const });
const send = (ctx: ReturnType<typeof context>, name: string, props?: object, eventId = randomUUID()) => POST(new Request("http://localhost/api/events", { method: "POST", headers: { "user-agent": "TestBrowser", "Content-Type": "application/json" }, body: JSON.stringify({ ...ctx, name, eventId, path: "/p/:product", locale: "my", ...(props && { props }) }) }));

describe("D5 từ phiên xem hàng đến nghiệp vụ thực", () => {
  it("phễu tuần tự, purchase chống trùng và các mốc đơn giữ cùng phiên", async () => {
    const ctx = context();
    const day = yangonDayKey(new Date());
    const before = await analyticsReport({ from: day, to: day });
    for (const name of ["view_item", "add_to_cart", "begin_checkout"]) expect((await send(ctx, name)).status).toBe(204);
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 5 }]);
    const input = orderInput(f, 2, { idempotencyKey: randomUUID() });
    const order = await createOrder(input, { userId: null, analytics: ctx });
    expect((await createOrder(input, { userId: null, analytics: ctx })).id).toBe(order.id);
    for (const step of ["confirmCod", "ship", "complete"] as const) await transitionOrder(order.id, step, admin(f), { carrier: "VTP" });
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    await returnItems(order.id, { lines: [{ orderItemId: item.id, qty: 1 }], reason: "Kiểm thử sự kiện", toLocationId: f.qc.id }, admin(f));
    const events = await prisma.analyticsEvent.findMany({ where: { orderId: order.id } });
    expect(events.filter((e) => e.name === "purchase")).toHaveLength(1);
    expect(events.every((e) => e.sessionId === ctx.sessionId && e.device === "mobile")).toBe(true);
    expect(events.find((e) => e.name === "refund")?.props).toMatchObject({ value: 10000, currency: "MMK" });
    const after = await analyticsReport({ from: day, to: day });
    for (const key of ["view", "cart", "checkout", "purchase", "confirmed", "shipped", "completed", "refund"] as const) expect(after.total[key] - before.total[key]).toBe(1);
  });

  it("beacon lặp không tăng mẫu và p75 dùng mẫu đo cuối", async () => {
    const ctx = context();
    const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    for (const [i, value] of [1000, 2000, 3000, 4000].entries()) expect((await send(ctx, "web_vital", { metric: "LCP", value, pageType: "product" }, ids[i])).status).toBe(204);
    expect((await send(ctx, "web_vital", { metric: "LCP", value: 2000, pageType: "product" }, ids[0])).status).toBe(204);
    expect(await prisma.analyticsEvent.count({ where: { sessionId: ctx.sessionId } })).toBe(4);
    const day = yangonDayKey(new Date());
    const report = await analyticsReport({ from: day, to: day });
    const rows = await prisma.analyticsEvent.findMany({ where: { name: "web_vital", device: "mobile", occurredAt: { gte: yangonDayStart(day), lt: yangonDayStart(addDays(day, 1)) } }, select: { props: true } });
    const values = rows.map((r) => r.props as { metric: string; value: number; pageType: string }).filter((p) => p.metric === "LCP" && p.pageType === "product").map((p) => p.value).sort((a, b) => a - b);
    const at = (values.length - 1) * .75;
    const expected = values[Math.floor(at)] + (values[Math.ceil(at)] - values[Math.floor(at)]) * (at - Math.floor(at));
    expect(report.vitals.find((v) => v.device === "mobile" && v.metric === "LCP" && v.pageType === "product")?.p75).toBe(expected);
  });

  it("tắt ghi sự kiện và dọn theo thời hạn", async () => {
    const ctx = context();
    await send(ctx, "view_item");
    const old = await prisma.analyticsEvent.create({ data: { name: "view_item", sessionId: ctx.sessionId, occurredAt: new Date(Date.now() - 181 * 86400000) } });
    await cleanupExpired();
    expect(await prisma.analyticsEvent.findUnique({ where: { id: old.id } })).toBeNull();
    vi.stubEnv("ANALYTICS_ENABLED", "false");
    await send(ctx, "view_item");
    expect(await prisma.analyticsEvent.count({ where: { sessionId: ctx.sessionId } })).toBe(1);
    const f = await saleFixture([{ lot: "A", expiryInDays: 400, qty: 1 }]);
    const order = await createOrder(orderInput(f, 1), { userId: null, analytics: ctx });
    expect(await prisma.analyticsEvent.count({ where: { orderId: order.id } })).toBe(0);
  });
});
