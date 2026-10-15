import { isAuthorizedCron } from "@/server/cron/auth";
import { cancelExpiredOrders } from "@/server/orders/cron";

/**
 * Tác vụ định kỳ (chạy được cả Vercel Cron lẫn crontab/Coolify).
 * Logic nằm ở src/server/<domain>/ (P2: giữ hàng/COD, P3: cảnh báo).
 */
const JOBS: Record<string, () => Promise<Record<string, unknown>>> = {
  "release-reservations": () => cancelExpiredOrders("BANK_TRANSFER"),
  "cancel-unconfirmed-cod": () => cancelExpiredOrders("COD"),
  "compute-alerts": async () => ({ alerts: 0, todo: "P3" }),
};

async function handle(req: Request, ctx: RouteContext<"/api/cron/[job]">) {
  if (!isAuthorizedCron(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { job } = await ctx.params;
  const run = JOBS[job];
  if (!run) return Response.json({ error: "unknown job" }, { status: 404 });
  const startedAt = Date.now();
  const result = await run();
  return Response.json({ job, ms: Date.now() - startedAt, ...result });
}

export { handle as GET, handle as POST };
