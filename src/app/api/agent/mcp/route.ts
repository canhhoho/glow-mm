import { handleAgentMcp } from "@/server/agent/mcp";

/**
 * P25 — cổng MCP cho trợ lý AI quản trị (docs/ket-noi-tro-ly-ai.md). Kiểm token/scope/rate limit trong handler
 * (proxy.ts bỏ qua /api). Thiếu AGENT_ADMIN_TOKEN / AGENT_ADMIN_USER_ID → 404.
 */
const handle = (req: Request) => handleAgentMcp(req);

export { handle as GET, handle as POST, handle as DELETE };
