import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/server/audit";
import { isRole } from "@/server/auth/roles";
import { AGENT_SCOPES, generateAgentToken, hashAgentToken, scopeAllowedFor, type AgentScope } from "./config";

/**
 * P25 gói A (A1) — token cổng trợ lý AI lưu trong DB: tạo (hiện token MỘT lần), thu hồi, liệt kê, tra theo header.
 * Trang quản lý: /admin/settings/agents. Token env `AGENT_ADMIN_TOKEN` vẫn dùng được (cách cũ) cho tới khi gỡ.
 */
export class AgentTokenError extends Error {}

const createSchema = z.object({
  name: z.string().trim().min(2, "Tên quá ngắn").max(60),
  userId: z.string().min(1, "Chọn tài khoản"),
  scopes: z.array(z.enum(AGENT_SCOPES)).min(1, "Chọn ít nhất một quyền"),
});

export async function createAgentToken(raw: unknown, actorId: string) {
  const input = createSchema.parse(raw);
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { role: true } });
  if (!user || !isRole(user.role)) throw new AgentTokenError("Tài khoản phải là nhân viên");
  const denied = input.scopes.filter((s) => !scopeAllowedFor(s, user.role));
  if (denied.length) throw new AgentTokenError(`Vai trò của tài khoản không có quyền: ${denied.join(", ")}`);
  const token = generateAgentToken();
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.agentToken.create({
      data: { name: input.name, tokenHash: hashAgentToken(token), tokenPrefix: token.slice(0, 6), scopes: [...new Set(input.scopes)], userId: input.userId, createdById: actorId },
    });
    await writeAudit(tx, { userId: actorId, action: "agent.token.create", entity: "AgentToken", entityId: created.id, data: { name: created.name, userId: created.userId, scopes: created.scopes } });
    return created;
  });
  return { id: row.id, token };
}

export async function revokeAgentToken(raw: unknown, actorId: string) {
  const { id } = z.object({ id: z.string().min(1) }).parse(raw);
  await prisma.$transaction(async (tx) => {
    const t = await tx.agentToken.findUnique({ where: { id }, select: { active: true, name: true } });
    if (!t) throw new AgentTokenError("Không có token này");
    if (!t.active) return;
    await tx.agentToken.update({ where: { id }, data: { active: false, revokedAt: new Date() } });
    await writeAudit(tx, { userId: actorId, action: "agent.token.revoke", entity: "AgentToken", entityId: id, data: { name: t.name } });
  });
}

export async function listAgentTokens() {
  return prisma.agentToken.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    select: { id: true, name: true, tokenPrefix: true, scopes: true, active: true, lastUsedAt: true, createdAt: true, revokedAt: true, user: { select: { id: true, name: true, role: true, active: true } } },
  });
}

/** Tài khoản nhân viên chọn được khi tạo token (kể cả tài khoản đã khoá đăng nhập — "Trợ lý AI" nên khoá). */
export function agentTokenUsers() {
  return prisma.user.findMany({ where: { role: { in: ["ADMIN", "WAREHOUSE_MANAGER", "ORDER_STAFF"] } }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true, role: true, active: true } });
}

export type ResolvedAgentToken = { tokenId: string; name: string; userId: string; scopes: AgentScope[] };

/** Header `Bearer <token>` → token DB còn hiệu lực (so bằng hash, không so chuỗi gốc). */
export async function resolveAgentToken(authorization: string | null): Promise<ResolvedAgentToken | null> {
  if (!authorization?.startsWith("Bearer ")) return null;
  const raw = authorization.slice(7).trim();
  if (raw.length < 32 || raw.length > 200) return null;
  const t = await prisma.agentToken.findUnique({ where: { tokenHash: hashAgentToken(raw) }, select: { id: true, name: true, userId: true, scopes: true, active: true } });
  if (!t?.active) return null;
  return { tokenId: t.id, name: t.name, userId: t.userId, scopes: t.scopes.filter((s): s is AgentScope => (AGENT_SCOPES as readonly string[]).includes(s)) };
}

/** Ghi lần dùng cuối — tối đa mỗi phút một lần để không ghi DB ở mọi lời gọi. */
export async function touchAgentToken(id: string, now = new Date()) {
  await prisma.agentToken.updateMany({ where: { id, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: new Date(now.getTime() - 60_000) } }] }, data: { lastUsedAt: now } });
}

export const hasActiveAgentTokens = async () => (await prisma.agentToken.count({ where: { active: true } })) > 0;
