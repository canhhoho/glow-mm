import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { PERMISSIONS, type Role } from "@/server/auth/roles";
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
  "orders:read",
  "public:read",
  "import:preview",
  "import:commit",
  "receive:draft",
  "catalog:submit",
] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];
export const DEFAULT_AGENT_SCOPES: AgentScope[] = ["catalog:read", "stock:read", "pricing:read", "import:preview"];

export type AgentConfig = { token: string; userId: string; scopes: Set<AgentScope> };

/**
 * Gói A (A4): vai trò nào được giữ scope nào. Quyền thực tế của token = scope của token GIAO với danh sách này theo vai trò
 * của tài khoản gắn token — token không bao giờ rộng hơn người thao tác. Scope ghi lấy đúng permission của thao tác tương ứng
 * trên admin; scope đọc theo quyết định Q4/Q5 (23/11/2026): tài khoản "Trợ lý AI" là Quản lý kho, được xem giá mua.
 */
export const SCOPE_ROLES: Record<AgentScope, readonly Role[]> = {
  "catalog:read": ["ADMIN", "WAREHOUSE_MANAGER"],
  "stock:read": PERMISSIONS["stock:view"],
  "pricing:read": ["ADMIN", "WAREHOUSE_MANAGER"],
  // Gói B2: đọc đơn (thông tin khách đã ẩn) — đúng quyền xem đơn trên admin.
  "orders:read": PERMISSIONS["orders:view"],
  // Gói B4: chỉ dữ liệu khách thấy trên web (token cho agent tư vấn khách) — nhân viên nào cũng được giữ.
  "public:read": ["ADMIN", "WAREHOUSE_MANAGER", "ORDER_STAFF"],
  "import:preview": ["ADMIN", "WAREHOUSE_MANAGER"],
  "import:commit": PERMISSIONS["catalog:manage"],
  "receive:draft": PERMISSIONS["stock:receive"],
  // Gửi duyệt SP trên admin cần catalog:manage (chỉ ADMIN) — mở cho Quản lý kho là quyết định nghiệp vụ, chưa chốt.
  "catalog:submit": PERMISSIONS["catalog:manage"],
};

export const scopeAllowedFor = (scope: AgentScope, role: string) => (SCOPE_ROLES[scope] as readonly string[]).includes(role);

/** Scope token ∩ quyền theo vai trò. Vai trò không phải nhân viên → rỗng. */
export function effectiveScopes(scopes: Iterable<AgentScope>, role: string): Set<AgentScope> {
  return new Set([...scopes].filter((s) => scopeAllowedFor(s, role)));
}

/** Token mới: 32 byte hex (64 ký tự, chỉ chữ/số — dán vào biến môi trường không cần thoát ký tự). */
export const generateAgentToken = () => randomBytes(32).toString("hex");
export const hashAgentToken = (token: string) => createHash("sha256").update(token).digest("hex");

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
