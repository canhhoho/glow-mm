import { toCsv } from "@/lib/csv";
import { getStaffUser } from "@/server/auth/session";
import { PRODUCT_CSV_COLUMNS, STOCK_CSV_COLUMNS } from "@/server/catalog/products";

/** File CSV mẫu cho import (chỉ nhân viên đã đăng nhập). */
const TEMPLATES: Record<string, (string | number)[][]> = {
  "products.csv": [
    [...PRODUCT_CSV_COLUMNS],
    ["sen-viet-sunscreen-spf50", "Sen Việt", "skincare", "နေကာခရင်မ် SPF50", "Sunscreen SPF50", "", "", "", "", "Aqua, Zinc Oxide", "Dưới 30°C", "SV-SUN-50", "50ml", 25000, 80],
    ["sen-viet-sunscreen-spf50", "Sen Việt", "skincare", "နေကာခရင်မ် SPF50", "Sunscreen SPF50", "", "", "", "", "Aqua, Zinc Oxide", "Dưới 30°C", "SV-SUN-100", "100ml", 42000, 140],
  ],
  "stock.csv": [
    [...STOCK_CSV_COLUMNS],
    ["SV-SUN-50", "VN-STOCK", "L2701", "2028-03-31", "2026-03-01", 95000, 50, "SELLABLE"],
    ["SV-SUN-50", "VN-STOCK", "L2701", "2028-03-31", "2026-03-01", 95000, 3, "TESTER"],
  ],
};

export async function GET(_req: Request, ctx: RouteContext<"/api/templates/[name]">) {
  if (!(await getStaffUser())) return new Response("Unauthorized", { status: 401 });
  const { name } = await ctx.params;
  const rows = TEMPLATES[name];
  if (!rows) return new Response("Not found", { status: 404 });
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
