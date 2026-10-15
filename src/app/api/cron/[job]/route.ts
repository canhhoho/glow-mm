import { isAuthorizedCron } from "@/server/cron/auth";

/**
 * Tác vụ định kỳ (chạy được cả Vercel Cron lẫn crontab/Coolify).
 * Logic từng job được cài ở phase tương ứng (P2: reservation/COD, P3: alerts).
 */
const JOBS: Record<string, () => Promise<Record<string, unknown>>> = {
  "release-reservations": async () => ({ released: 0, todo: "P2" }),
  "cancel-unconfirmed-cod": async () => ({ cancelled: 0, todo: "P2" }),
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
