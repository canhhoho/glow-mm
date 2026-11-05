import { z } from "zod";
import { yangonDayKey } from "@/lib/time";
import { can } from "@/server/auth/roles";
import { getStaffUser } from "@/server/auth/session";
import { dataHealth } from "@/server/reports/data-health";

const query = z.object({ days: z.enum(["30", "90"]).default("30") });

/** D0: tải mốc sức khoẻ dữ liệu dạng JSON để lưu lại và so trước/sau (chỉ đọc, chỉ ADMIN). */
export async function GET(request: Request) {
  const user = await getStaffUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user.role, "reports:view")) return Response.json({ error: "Forbidden" }, { status: 403 });
  const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: "days must be 30 or 90" }, { status: 400 });
  const now = new Date();
  const report = await dataHealth(now, Number(parsed.data.days));
  return new Response(JSON.stringify(report, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="data-health-${yangonDayKey(now)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
