import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { analyticsConfig, env } from "@/lib/env";
import { clientIp } from "@/lib/client-ip";
import { hitRateLimit } from "@/server/rate-limit";
import { clientEventSchema } from "@/server/analytics/schema";

export async function POST(request: Request) {
  if (!analyticsConfig().ANALYTICS_ENABLED) return new Response(null, { status: 204 });
  if (/bot|crawler|spider|headless|lighthouse/i.test(request.headers.get("user-agent") ?? "")) return new Response(null, { status: 204 });
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== new URL(env().APP_URL).origin && origin !== new URL(request.url).origin)) return Response.json({ error: "Origin not allowed" }, { status: 403 });
  const ipHash = createHash("sha256").update(clientIp(request.headers)).digest("hex");
  if (!(await hitRateLimit(`events:ip:${ipHash}`, 240, 60000))) return Response.json({ error: "Too many events" }, { status: 429 });
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Invalid event" }, { status: 400 });
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 8192) { await reader.cancel(); return Response.json({ error: "Event too large" }, { status: 413 }); }
    chunks.push(part.value);
  }
  try {
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
    const parsed = clientEventSchema.safeParse(JSON.parse(new TextDecoder().decode(body)));
    if (!parsed.success) return Response.json({ error: "Invalid event" }, { status: 400 });
    const event = parsed.data;
    if (!(await hitRateLimit(`events:session:${event.sessionId}`, 60, 60000))) return Response.json({ error: "Too many events" }, { status: 429 });
    const dedupeKey = `client:${event.sessionId}:${event.name}:${event.eventId}`;
    await prisma.analyticsEvent.upsert({ where: { dedupeKey }, update: event.name === "web_vital" ? { props: event.props } : {}, create: {
      name: event.name, sessionId: event.sessionId, locale: event.locale, device: event.device, path: event.path, dedupeKey, props: event.props,
    } });
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid event" }, { status: 400 });
    // Chỉ mã/loại lỗi để chẩn đoán; không ghi message/query có thể chứa dữ liệu request.
    const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" && /^[A-Z0-9_]{1,20}$/.test(error.code) ? error.code : error instanceof Error ? error.name : "unknown";
    console.error("analytics.write_failed", { code });
    return Response.json({ error: "Event unavailable" }, { status: 503 });
  }
}
