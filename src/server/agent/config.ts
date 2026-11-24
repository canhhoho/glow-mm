import "server-only";
import { createHash } from "node:crypto";
import { isAuthorizedCron } from "@/server/cron/auth";
import { agentEnvSchema, isPlaceholderSecret } from "@/lib/env";

/**
 * P25 — cấu hình cổng trợ lý AI (docs/ket-noi-tro-ly-ai.md §5). Đọc thẳng biến môi trường mỗi lần (như CRON_SECRET)
 * để đổi/xoá token có hiệu lực ngay khi khởi động lại. Thiếu token hoặc user → cổng tắt (404).
 */
export const AGENT_SCOPES = [
  "catalog:read",
  "stock:read",
  "pricing:read",
  "import:preview",
  "import:commit",
  "receive:draft",
  "catalog:submit",
] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];
export const DEFAULT_AGENT_SCOPES: AgentScope[] = ["catalog:read", "stock:read", "pricing:read", "import:preview"];

export type AgentConfig = { token: string; userId: string; scopes: Set<AgentScope> };

/** Chuỗi "a,b" → tập scope hợp lệ; scope lạ bị bỏ qua (không mở rộng quyền ngoài danh sách). Trống → mặc định chỉ đọc. */
export function parseScopes(raw: string | undefined): Set<AgentScope> {
  const items = (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (items.length === 0) return new Set(DEFAULT_AGENT_SCOPES);
  return new Set(items.filter((s): s is AgentScope => (AGENT_SCOPES as readonly string[]).includes(s)));
}

/** null = cổng tắt (thiếu biến, token quá ngắn, hoặc token mẫu ở production). */
export function agentConfig(env: Record<string, string | undefined> = process.env): AgentConfig | null {
  const parsed = agentEnvSchema.safeParse(env);
  if (!parsed.success) return null;
  const { AGENT_ADMIN_TOKEN: token, AGENT_ADMIN_USER_ID: userId, AGENT_ADMIN_SCOPES } = parsed.data;
  if (!token || !userId) return null;
  if (env.NODE_ENV === "production" && isPlaceholderSecret(token)) return null;
  return { token, userId, scopes: parseScopes(AGENT_ADMIN_SCOPES) };
}

/** So token bằng timingSafeEqual (cùng cách với cron). */
export const isAuthorizedAgent = (authorization: string | null, cfg: AgentConfig) => isAuthorizedCron(authorization, cfg.token);

/** Khoá rate limit theo token mà không lưu token: hash ngắn. */
export const tokenKey = (token: string) => createHash("sha256").update(token).digest("hex").slice(0, 16);
