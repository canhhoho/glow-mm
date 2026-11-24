import { describe, expect, it } from "vitest";
import { agentConfig, DEFAULT_AGENT_SCOPES, isAuthorizedAgent, parseScopes } from "@/server/agent/config";
import { AGENT_TOOLS } from "@/server/agent/tools";

const TOKEN = "t".repeat(40);

describe("P25 cấu hình cổng trợ lý AI", () => {
  it("thiếu token / user / token ngắn → cổng tắt", () => {
    expect(agentConfig({})).toBeNull();
    expect(agentConfig({ AGENT_ADMIN_TOKEN: TOKEN })).toBeNull();
    expect(agentConfig({ AGENT_ADMIN_TOKEN: "", AGENT_ADMIN_USER_ID: "" })).toBeNull();
    expect(agentConfig({ AGENT_ADMIN_TOKEN: "short", AGENT_ADMIN_USER_ID: "u1" })).toBeNull();
  });

  it("token mẫu bị chặn ở production", () => {
    const env = { AGENT_ADMIN_TOKEN: "change-me-agent-token-0123456789abcdef", AGENT_ADMIN_USER_ID: "u1" };
    expect(agentConfig(env)).not.toBeNull();
    expect(agentConfig({ ...env, NODE_ENV: "production" })).toBeNull();
  });

  it("scope: trống = chỉ đọc; scope lạ bị bỏ", () => {
    expect([...parseScopes(undefined)]).toEqual(DEFAULT_AGENT_SCOPES);
    expect([...parseScopes(" catalog:read , admin:all,receive:draft")]).toEqual(["catalog:read", "receive:draft"]);
    expect(agentConfig({ AGENT_ADMIN_TOKEN: TOKEN, AGENT_ADMIN_USER_ID: "u1", AGENT_ADMIN_SCOPES: "stock:read" })?.scopes).toEqual(new Set(["stock:read"]));
  });

  it("so token đúng/sai", () => {
    const cfg = agentConfig({ AGENT_ADMIN_TOKEN: TOKEN, AGENT_ADMIN_USER_ID: "u1" })!;
    expect(isAuthorizedAgent(`Bearer ${TOKEN}`, cfg)).toBe(true);
    expect(isAuthorizedAgent(`Bearer ${TOKEN}x`, cfg)).toBe(false);
    expect(isAuthorizedAgent(TOKEN, cfg)).toBe(false);
    expect(isAuthorizedAgent(null, cfg)).toBe(false);
  });

  it("GĐ 3 chỉ có công cụ đọc, mỗi công cụ đúng scope", () => {
    expect(Object.fromEntries(AGENT_TOOLS.map((t) => [t.name, t.scope]))).toEqual({
      catalog_search: "catalog:read",
      catalog_get: "catalog:read",
      stock_summary: "stock:read",
      stock_available: "stock:read",
      reorder_suggestions: "stock:read",
      pricing_get: "pricing:read",
      import_preview: "import:preview",
    });
  });

  it("parse input: giới hạn số SKU và limit", () => {
    const tool = (n: string) => AGENT_TOOLS.find((t) => t.name === n)!.input;
    expect(tool("stock_available").safeParse({ skus: [] }).success).toBe(false);
    expect(tool("stock_available").safeParse({ skus: Array.from({ length: 101 }, (_, i) => `S${i}`) }).success).toBe(false);
    expect(tool("catalog_search").safeParse({ limit: 51 }).success).toBe(false);
    expect(tool("catalog_search").parse({})).toMatchObject({ tab: "active", limit: 20, page: 1 });
  });
});
