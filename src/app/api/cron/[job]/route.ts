import { isAuthorizedCron } from "@/server/cron/auth";
import { cleanupExpired } from "@/server/cron/cleanup";
import { runComputeAlerts } from "@/server/alerts/queries";
import { cancelExpiredOrders } from "@/server/orders/cron";

/**
 * Tác vụ định kỳ (chạy được cả Vercel Cron lẫn crontab/Coolify).
 * Logic nằm ở src/server/<domain>/ (P2: giữ hàng/COD, P3: cảnh báo, P19: dọn dữ liệu tạm).
 * Lỗi → log một dòng JSON + HTTP 500 (`curl -f` trong crontab báo lỗi, log Docker thấy được).
 */
const JOBS: Record<string, () => Promise<Record<string, unknown>>> = {
  "release-reservations": () => cancelExpiredOrders("BANK_TRANSFER"),
  "cancel-unconfirmed-cod": () => cancelExpiredOrders("COD"),
  "compute-alerts": async () => ({ alerts: await runComputeAlerts() }),
  cleanup: () => cleanupExpired(),
};

async function handle(req: Request, ctx: RouteContext<"/api/cron/[job]">) {
  if (!isAuthorizedCron(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { job } = await ctx.params;
  const run = JOBS[job];
  if (!run) return Response.json({ error: "unknown job" }, { status: 404 });
  const startedAt = Date.now();
  try {
    const result = await run();
    return Response.json({ job, ms: Date.now() - startedAt, ...result });
  } catch (e) {
    console.error(JSON.stringify({ cron: job, ms: Date.now() - startedAt, error: e instanceof Error ? e.message : String(e) }));
    return Response.json({ job, ok: false, error: "job failed" }, { status: 500 });
  }
}

export { handle as GET, handle as POST };
