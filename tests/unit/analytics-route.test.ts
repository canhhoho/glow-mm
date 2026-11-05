import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ enabled: true, limit: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { analyticsEvent: { upsert: mocks.upsert } } }));
vi.mock("@/lib/env", () => ({ analyticsConfig: () => ({ ANALYTICS_ENABLED: mocks.enabled }), env: () => ({ APP_URL: "http://localhost" }) }));
vi.mock("@/server/rate-limit", () => ({ hitRateLimit: mocks.limit }));
import { POST } from "@/app/api/events/route";
const event = { name: "view_item", eventId: "2c6759cb-a4b5-4d40-826f-c8cf67570b9c", sessionId: "09ba05a0-124f-4147-9304-ed0b8b5297ea", device: "mobile", path: "/p/:product" };
const request = (body: unknown = event, headers: Record<string, string> = {}) => POST(new Request("http://localhost/api/events", { method: "POST", headers: { "Content-Type": "application/json", "user-agent": "TestBrowser", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) }));
beforeEach(() => { vi.clearAllMocks(); mocks.enabled = true; mocks.limit.mockResolvedValue(true); mocks.upsert.mockResolvedValue({}); });
describe("API sự kiện", () => {
  it("từ chối PII/tên lạ/giả sự kiện đơn, origin khác và payload lớn", async () => {
    expect((await request({ ...event, phone: "0978123456" })).status).toBe(400);
    expect((await request({ ...event, name: "purchase" })).status).toBe(400);
    expect((await request(event, { origin: "https://other.invalid" })).status).toBe(403);
    expect((await request("x".repeat(8193))).status).toBe(413);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("tắt hoặc bot không ghi DB; quá tần suất trả 429", async () => {
    mocks.enabled = false;
    expect((await request()).status).toBe(204);
    expect(mocks.limit).not.toHaveBeenCalled();
    mocks.enabled = true;
    expect((await request(event, { "user-agent": "Googlebot" })).status).toBe(204);
    mocks.limit.mockResolvedValue(false);
    expect((await request()).status).toBe(429);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("dedupe theo mã sự kiện; Web Vitals cập nhật giá trị cuối", async () => {
    expect((await request()).status).toBe(204);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { dedupeKey: `client:${event.sessionId}:${event.name}:${event.eventId}` }, update: {}, create: expect.objectContaining({ path: "/p/:product", sessionId: event.sessionId }) }));
    const props = { metric: "LCP", value: 2500, pageType: "product" };
    expect((await request({ ...event, name: "web_vital", props })).status).toBe(204);
    expect(mocks.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ update: { props } }));
  });
});
