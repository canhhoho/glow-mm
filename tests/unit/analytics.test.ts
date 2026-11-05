import { describe, expect, it } from "vitest";
import { analyticsPath, analyticsPageType } from "@/lib/analytics-events";
import { clientEventSchema } from "@/server/analytics/schema";
import { FUNNEL_KEYS, summarizeFunnel, type FunnelRawRow } from "@/server/analytics/funnel";

const event = { name: "view_item", eventId: "2c6759cb-a4b5-4d40-826f-c8cf67570b9c", sessionId: "09ba05a0-124f-4147-9304-ed0b8b5297ea", device: "mobile", path: "/p/:product", locale: "my" };
describe("D5 dữ liệu tối thiểu", () => {
  it("không nhận PII, tên server, query hoặc thuộc tính tùy ý", () => {
    expect(clientEventSchema.safeParse(event).success).toBe(true);
    for (const patch of [{ email: "private@example.test" }, { phone: "0978123456" }, { name: "purchase" }, { orderId: "private" }, { path: "/order/OD-SECRET" }, { props: { address: "private" } }]) {
      expect(clientEventSchema.safeParse({ ...event, ...patch }).success).toBe(false);
    }
    expect(clientEventSchema.safeParse({ ...event, name: "web_vital", props: { metric: "LCP", value: 1200, pageType: "product" } }).success).toBe(true);
    expect(clientEventSchema.safeParse({ ...event, name: "web_vital", props: { metric: "LCP", value: -1, pageType: "product" } }).success).toBe(false);
  });
  it("bỏ query, mã đơn và slug, vẫn biết đúng loại trang", () => {
    expect(analyticsPath("/en/order/OD-PRIVATE?phone=0978123456")).toBe("/order/:order");
    expect(analyticsPath("/vi/p/sunscreen?ref=CTV123")).toBe("/p/:product");
    expect(analyticsPath("/account/addresses?email=private")).toBe("/account");
    expect(analyticsPath("/unknown/private")).toBe("/other");
    expect(analyticsPageType("/en/p/sunscreen")).toBe("product");
    expect(analyticsPageType("/vi")).toBe("home");
  });
  it("gộp thiết bị, bigint và nhánh đăng nhập không làm sai tỷ lệ mua", () => {
    const row = (device: string, values: Partial<Record<typeof FUNNEL_KEYS[number], bigint>>): FunnelRawRow => ({ device, ...Object.fromEntries(FUNNEL_KEYS.map((k) => [k, values[k] ?? BigInt(0)])) } as FunnelRawRow);
    const result = summarizeFunnel([row("mobile", { view: BigInt(10), purchase: BigInt(2), login: BigInt(3) }), row("desktop", { view: BigInt(5), purchase: BigInt(1) }), row("legacy", { view: BigInt(5) })]);
    expect(result.total).toMatchObject({ view: 20, purchase: 3, login: 3 });
    expect(result.groups.unknown.view).toBe(5);
    expect(result.conversionPct).toBe(15);
    expect(summarizeFunnel([]).conversionPct).toBeNull();
  });
});
