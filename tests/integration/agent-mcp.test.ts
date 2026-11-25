import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { toCsv } from "@/lib/csv";
import { tokenKey } from "@/server/agent/config";
import { createAgentToken, revokeAgentToken } from "@/server/agent/tokens";
import { listAuditLogs } from "@/server/admin/audit-log";
import { listDocuments } from "@/server/inventory/queries";
import { AGENT_RATE, handleAgentMcp } from "@/server/agent/mcp";
import { hitRateLimit } from "@/server/rate-limit";
import { saleFixture, unpublishTestProducts, type SaleFixture } from "./fixtures";

/** P25 GĐ 3 — cổng MCP chỉ đọc cho trợ lý AI (docs/ket-noi-tro-ly-ai.md §10). */
afterAll(unpublishTestProducts);

const USER_ID = "it-agent";
const newToken = () => randomBytes(24).toString("hex");
let token = newToken();
let f: SaleFixture;
const env = (extra: Record<string, string> = {}) => ({ AGENT_ADMIN_TOKEN: token, AGENT_ADMIN_USER_ID: USER_ID, ...extra });

let seq = 0;
function rpc(method: string, params?: Record<string, unknown>, opts: { auth?: string | null; env?: Record<string, string | undefined>; id?: number | null } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream" };
  const auth = opts.auth === undefined ? `Bearer ${token}` : opts.auth;
  if (auth) headers.authorization = auth;
  const id = opts.id === undefined ? ++seq : opts.id;
  const body = JSON.stringify({ jsonrpc: "2.0", method, ...(id !== null && { id }), ...(params && { params }) });
  return handleAgentMcp(new Request("http://localhost/api/agent/mcp", { method: "POST", headers, body }), opts.env ?? env());
}
async function call(name: string, args: Record<string, unknown> = {}, e?: Record<string, string>) {
  const res = await rpc("tools/call", { name, arguments: args }, { env: e ?? env() });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- kết quả công cụ khác nhau theo tên, test chỉ so trường
  const body = (await res.json()) as { result?: { isError?: boolean; structuredContent?: any; content: { text: string }[] }; error?: { message: string } };
  return { status: res.status, ...body };
}

beforeAll(async () => {
  await prisma.user.upsert({
    where: { id: USER_ID },
    update: {},
    create: { id: USER_ID, email: "it-agent@glow.local", name: "Trợ lý AI (test)", role: "WAREHOUSE_MANAGER", active: false },
  });
  f = await saleFixture([{ lot: "A1", expiryInDays: 400, qty: 7 }]);
  await prisma.variant.update({ where: { id: f.variantId }, data: { purchasePriceVnd: 120_000, purchasePriceAt: new Date() } });
});

describe("Cổng MCP trợ lý AI — xác thực", () => {
  it("thiếu biến môi trường → 404; sai/thiếu token → 401; GET → 405", async () => {
    expect((await rpc("ping", undefined, { env: {} })).status).toBe(404);
    expect((await rpc("ping", undefined, { env: { AGENT_ADMIN_TOKEN: token } })).status).toBe(404);
    expect((await rpc("ping", undefined, { auth: "Bearer sai" })).status).toBe(401);
    expect((await rpc("ping", undefined, { auth: null })).status).toBe(401);
    const get = await handleAgentMcp(new Request("http://localhost/api/agent/mcp", { headers: { authorization: `Bearer ${token}` } }), env());
    expect(get.status).toBe(405);
  });

  it("user không phải nhân viên → 503", async () => {
    expect((await rpc("ping", undefined, { env: env({ AGENT_ADMIN_USER_ID: "khong-ton-tai" }) })).status).toBe(503);
  });

  it("initialize / ping / thông báo / phương thức lạ", async () => {
    const init = await (await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "it", version: "1" } })).json();
    expect(init.result).toMatchObject({ protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "tandc-admin" } });
    expect((await rpc("notifications/initialized", undefined, { id: null })).status).toBe(202);
    expect((await (await rpc("ping")).json()).result).toEqual({});
    expect((await (await rpc("resources/list")).json()).error.code).toBe(-32601);
  });

  it("tools/list theo scope; thiếu scope → 403; mặc định không có công cụ ghi", async () => {
    const all = await (await rpc("tools/list")).json();
    expect(all.result.tools.map((t: { name: string }) => t.name).sort()).toEqual(
      ["catalog_get", "catalog_search", "import_preview", "pricing_get", "reorder_suggestions", "stock_available", "stock_summary"],
    );
    expect(all.result.tools.find((t: { name: string }) => t.name === "stock_available").inputSchema).toMatchObject({ type: "object", required: ["skus"] });
    // A6: nhãn an toàn MCP — mọi công cụ GĐ 3 chỉ đọc.
    expect(all.result.tools.every((t: { annotations: { readOnlyHint: boolean } }) => t.annotations.readOnlyHint === true)).toBe(true);
    const onlyStock = env({ AGENT_ADMIN_SCOPES: "stock:read" });
    const list = await (await rpc("tools/list", undefined, { env: onlyStock })).json();
    expect(list.result.tools.map((t: { name: string }) => t.name).sort()).toEqual(["reorder_suggestions", "stock_available", "stock_summary"]);
    const denied = await call("pricing_get", { skus: [`IT-${f.tag}`] }, onlyStock);
    expect(denied.status).toBe(403);
    const unknown = await call("receive_draft", {});
    expect(unknown.error?.message).toContain("Không có công cụ");
  });

  it("quá giới hạn → 429", async () => {
    token = newToken();
    for (let i = 0; i < AGENT_RATE.max; i++) await hitRateLimit(`agent:${tokenKey(token)}`, AGENT_RATE.max, AGENT_RATE.windowMs);
    expect((await rpc("ping")).status).toBe(429);
    token = newToken();
  });
});

describe("Cổng MCP trợ lý AI — công cụ đọc", () => {
  it("catalog_search / catalog_get trả đúng SP", async () => {
    const found = await call("catalog_search", { q: f.tag });
    expect(found.result?.isError).toBeUndefined();
    expect(found.result?.structuredContent.rows).toHaveLength(1);
    expect(found.result?.structuredContent.rows[0]).toMatchObject({ name: `IT product ${f.tag}`, stock: 7, variants: [{ sku: `IT-${f.tag}` }] });
    const byWarehouse = await call("catalog_search", { warehouse: f.mm.code, q: f.tag });
    expect(byWarehouse.result?.structuredContent.total).toBe(1);
    expect((await call("catalog_search", { brand: "khong-co-brand-nay" })).result?.isError).toBe(true);

    const got = await call("catalog_get", { sku: `it-${f.tag}`.toLowerCase() });
    expect(got.result?.structuredContent).toMatchObject({ name: `IT product ${f.tag}`, warehouse: { code: f.mm.code, pricingMode: "VN_IMPORT" }, published: true });
    expect(got.result?.structuredContent.readiness.errors).toBeInstanceOf(Array);
    const missing = await call("catalog_get", { sku: "KHONG-CO" });
    expect(missing.result?.isError).toBe(true);
    expect(missing.result?.content[0].text).toContain("Không có SKU");
  });

  it("stock_summary / stock_available / reorder_suggestions", async () => {
    const sum = await call("stock_summary", { q: `IT-${f.tag}` });
    expect(sum.result?.structuredContent.rows[0]).toMatchObject({ sku: `IT-${f.tag}`, byWarehouse: { [f.mm.code]: 7 }, available: 7 });
    const av = await call("stock_available", { skus: [`IT-${f.tag}`, "KHONG-CO"] });
    expect(av.result?.structuredContent).toEqual({ rows: [{ sku: `IT-${f.tag}`, isBundle: false, active: true, available: 7, plannedReceiveQty: 0 }], missing: ["KHONG-CO"] });
    const re = await call("reorder_suggestions");
    expect(re.result?.structuredContent.settings.salesWindowDays).toBeGreaterThan(0);
    expect(re.result?.structuredContent.rows).toBeInstanceOf(Array);
  });

  it("pricing_get trả giá bán + giá mua theo kho", async () => {
    const p = await call("pricing_get", { skus: [`IT-${f.tag}`] });
    expect(p.result?.structuredContent.rows[0]).toMatchObject({ sku: `IT-${f.tag}`, warehouse: f.mm.code, priceMmk: 10000, purchase: { currency: "VND", vnd: 120_000 } });
  });

  it("import_preview khớp quy tắc trang Nhập Excel và không ghi gì vào DB", async () => {
    const before = await Promise.all([prisma.product.count(), prisma.catalogOpeningImport.count(), prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } })]);
    const csv = toCsv([["sku", "unit_cost"], [`IT-${f.tag}`, "150000"]]);
    const res = await call("import_preview", { csv });
    expect(res.result?.isError).toBeUndefined();
    const out = res.result!.structuredContent;
    expect(out.ok).toBe(true);
    expect(out.previewHash).toMatch(/^[0-9a-f]{64}$/);
    expect(out.rows[0]).toMatchObject({ sku: `IT-${f.tag}`, purchase: { amount: 150000, currency: "VND" } });
    const after = await Promise.all([prisma.product.count(), prisma.catalogOpeningImport.count(), prisma.variant.findUniqueOrThrow({ where: { id: f.variantId } })]);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
    expect(after[2].purchasePriceVnd).toBe(120_000);

    const bad = await call("import_preview", { csv: "foo,bar\n1,2" });
    expect(bad.result?.isError).toBe(true);
    expect(bad.result?.content[0].text).toContain("tiêu đề");
  });

  it("ghi audit agent.call (không lưu CSV/token)", async () => {
    const logs = await prisma.auditLog.findMany({ where: { userId: USER_ID, action: "agent.call", entityId: "import_preview" }, orderBy: { createdAt: "desc" }, take: 2 });
    expect(logs).toHaveLength(2);
    const data = logs.map((l) => l.data as Record<string, unknown>);
    expect(data.some((d) => d.ok === true && typeof d.csvHash === "string")).toBe(true);
    expect(JSON.stringify(data)).not.toContain(token);
    expect(JSON.stringify(data)).not.toContain("unit_cost");
  });
});

describe("Gói A — token DB, chốt quyền theo vai trò, nhật ký, nguồn phiếu", () => {
  const ORDER_USER = "it-agent-order";
  const noEnv = {}; // chỉ token DB (cổng env tắt)
  const callAs = async (tok: string, method: string, params?: Record<string, unknown>) => {
    const res = await handleAgentMcp(
      new Request("http://localhost/api/agent/mcp", { method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, ...(params && { params }) }) }),
      noEnv,
    );
    return { status: res.status, body: res.status === 200 || res.status === 403 ? await res.json() : null };
  };

  beforeAll(async () => {
    await prisma.user.upsert({ where: { id: ORDER_USER }, update: {}, create: { id: ORDER_USER, email: "it-agent-order@glow.local", name: "AI đơn (test)", role: "ORDER_STAFF", active: false } });
  });

  it("token DB: gọi được, ghi lần dùng cuối; thu hồi → 401; không token nào bật + không env → 404", async () => {
    const { id, token: tok } = await createAgentToken({ name: "it-kho", userId: USER_ID, scopes: ["catalog:read", "stock:read"] }, f.userId);
    const list = await callAs(tok, "tools/list");
    expect(list.status).toBe(200);
    expect(list.body.result.tools.map((t: { name: string }) => t.name).sort()).toEqual(["catalog_get", "catalog_search", "reorder_suggestions", "stock_available", "stock_summary"]);
    expect((await callAs(tok, "tools/call", { name: "stock_available", arguments: { skus: [`IT-${f.tag}`] } })).body.result.structuredContent.rows[0].available).toBe(7);
    expect((await prisma.agentToken.findUniqueOrThrow({ where: { id } })).lastUsedAt).not.toBeNull();
    expect((await prisma.agentToken.findUniqueOrThrow({ where: { id } })).tokenHash).not.toBe(tok);

    await revokeAgentToken({ id }, f.userId);
    const other = await prisma.agentToken.count({ where: { active: true } });
    expect((await callAs(tok, "ping")).status).toBe(other > 0 ? 401 : 404);
    await prisma.agentToken.updateMany({ where: { name: { startsWith: "it-" } }, data: { active: false } });
    expect((await callAs(tok, "ping")).status).toBe((await prisma.agentToken.count({ where: { active: true } })) > 0 ? 401 : 404);
  });

  it("A4: tạo token với quyền vai trò không có → từ chối; token cũ vượt vai trò bị cắt lúc gọi", async () => {
    await expect(createAgentToken({ name: "it-don", userId: ORDER_USER, scopes: ["pricing:read"] }, f.userId)).rejects.toThrow("pricing:read");
    await expect(createAgentToken({ name: "it-kh", userId: "khong-ton-tai", scopes: ["stock:read"] }, f.userId)).rejects.toThrow("nhân viên");
    const { id, token: tok } = await createAgentToken({ name: "it-don2", userId: ORDER_USER, scopes: ["stock:read"] }, f.userId);
    // Giả lập token lưu từ trước có scope rộng hơn vai trò.
    await prisma.agentToken.update({ where: { id }, data: { scopes: ["stock:read", "pricing:read"] } });
    const list = await callAs(tok, "tools/list");
    expect(list.body.result.tools.map((t: { name: string }) => t.name).sort()).toEqual(["reorder_suggestions", "stock_available", "stock_summary"]);
    expect((await callAs(tok, "tools/call", { name: "pricing_get", arguments: { skus: [`IT-${f.tag}`] } })).status).toBe(403);
    await revokeAgentToken({ id }, f.userId);
  });

  it("nhật ký: lọc theo người / nhóm hành động; ghi tạo + thu hồi token và agent.call kèm tên token", async () => {
    const byAgent = await listAuditLogs({ userId: USER_ID, action: "agent" });
    expect(byAgent.rows.length).toBeGreaterThan(0);
    expect(byAgent.rows.every((r) => r.userId === USER_ID && r.action.startsWith("agent."))).toBe(true);
    expect(byAgent.rows.some((r) => (r.data as { token?: string } | null)?.token === "it-kho")).toBe(true);
    const tokenOps = await listAuditLogs({ userId: f.userId, action: "agent.token.revoke" });
    expect(tokenOps.rows.length).toBeGreaterThan(0);
    expect(tokenOps.rows[0].user?.name).toBeTruthy();
  });

  it("nguồn phiếu: mặc định STAFF, lọc được phiếu AGENT", async () => {
    const doc = await prisma.stockDocument.create({ data: { code: `IT-AG-${f.tag}`, type: "RECEIVE", toId: f.mm.id, createdById: USER_ID, source: "AGENT" } });
    const agentDrafts = await listDocuments({ status: "DRAFT", source: "AGENT", q: doc.code });
    expect(agentDrafts.rows.map((d) => d.code)).toEqual([doc.code]);
    expect((await listDocuments({ status: "DRAFT", source: "STAFF", q: doc.code })).total).toBe(0);
    await prisma.stockDocument.update({ where: { id: doc.id }, data: { status: "CANCELLED" } });
  });
});
