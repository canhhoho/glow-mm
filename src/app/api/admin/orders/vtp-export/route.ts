import { z } from "zod";
import { getStaffUser } from "@/server/auth/session";
import { can } from "@/server/auth/roles";
import { yangonDayKey } from "@/lib/time";
import { vtpOrders } from "@/server/orders/vtp-queries";
import { vtpRow } from "@/server/orders/vtp-data";
import { createVtpWorkbook } from "@/server/orders/vtp-workbook";

const schema = z.object({
  service: z.string(), chargePayer: z.enum(["Order", "Sender", "Receiver"]).default("Order"), pickupTime: z.string().default(""),
  orders: z.array(z.object({ id: z.string().min(1).max(100), weightGrams: z.number().int().positive(), addressKey: z.string(), recipientName: z.string().trim().min(1), note: z.string().max(600) })).min(1).max(200),
});

export async function POST(request: Request) {
  const user = await getStaffUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user.role, "orders:ship")) return Response.json({ error: "Không có quyền xuất đơn vận chuyển." }, { status: 403 });
  try {
    const input = schema.safeParse(await request.json());
    if (!input.success) return Response.json({ error: "Chọn đơn, dịch vụ và điền khối lượng nguyên dương cho mỗi đơn." }, { status: 400 });
    const ids = input.data.orders.map((o) => o.id);
    if (new Set(ids).size !== ids.length) return Response.json({ error: "Danh sách có đơn trùng lặp." }, { status: 400 });
    const orders = await vtpOrders(ids);
    if (orders.length !== ids.length) return Response.json({ error: "Một số đơn không còn ở bước Chuẩn bị giao. Tải lại danh sách trước khi xuất." }, { status: 409 });
    const byId = new Map(orders.map((o) => [o.id, o]));
    const rows = input.data.orders.map((o, index) => vtpRow(byId.get(o.id)!, { ...input.data, ...o }, index));
    const bytes = await createVtpWorkbook(rows);
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="VTP-orders-${yangonDayKey(new Date())}.xlsx"`,
      "Cache-Control": "private, no-store",
    } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Không xuất được file VTP." }, { status: 400 });
  }
}
