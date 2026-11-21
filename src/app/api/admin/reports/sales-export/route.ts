import { getTranslations } from "next-intl/server";
import { requiredRange } from "@/lib/date-range";
import { can } from "@/server/auth/roles";
import { getStaffUser } from "@/server/auth/session";
import { SALES_RANGE, salesReport } from "@/server/reports/queries";
import { buildTableWorkbook } from "@/server/reports/xlsx-table";

/**
 * Xuất Excel báo cáo bán hàng (21/11/2026, audit #15) — cùng kỳ và cùng số liệu với trang Báo cáo › Bán hàng (`salesReport`):
 * sheet Tổng hợp (chuỗi doanh thu → lợi nhuận), Theo ngày, Sản phẩm (mọi SKU có bán, không chỉ top 10). Chỉ đọc.
 */
export async function GET(request: Request) {
  const user = await getStaffUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!can(user.role, "reports:view")) return new Response("Forbidden", { status: 403 });
  const sp = new URL(request.url).searchParams;
  const range = requiredRange({ from: sp.get("from"), to: sp.get("to") }, SALES_RANGE);
  const [t, tc, report] = await Promise.all([getTranslations("Reports"), getTranslations("Common"), salesReport(range, { topN: 100_000 })]);
  const { totals } = report;
  const bytes = buildTableWorkbook([
    {
      name: t("sheetSummary"),
      columns: [{ label: t("chainItem"), width: 40 }, { label: "MMK", numeric: true, width: 18 }],
      rows: [
        [t("period"), `${range.from} → ${range.to}`],
        [t("orders"), totals.orders],
        [t("revenue"), totals.revenue],
        [`− ${t("cogs")}`, totals.cogs],
        [`= ${t("profit")}`, totals.profit],
        [`− ${t("commission")}`, totals.commission],
        [`= ${t("profitAfterCommission")}`, totals.profitAfterCommission],
        [`− ${t("codCarrierFees")}`, totals.codCarrierFees],
        [`= ${t("profitAfterRecordedCosts")}`, totals.profitAfterRecordedCosts],
        [t("returns"), totals.returnedRevenue],
        [t("shippingFees"), totals.shippingFees],
      ],
    },
    {
      name: t("daily"),
      columns: [{ label: t("day"), width: 14 }, { label: t("orders"), numeric: true }, { label: t("revenue"), numeric: true }, { label: t("cogs"), numeric: true }, { label: t("profit"), numeric: true }],
      rows: report.daily.map((d) => [d.day, d.orders, d.revenue, d.cogs, d.profit]),
    },
    {
      name: t("sheetProducts"),
      columns: [{ label: "SKU", width: 20 }, { label: tc("product"), width: 40 }, { label: t("units"), numeric: true }, { label: t("revenue"), numeric: true }, { label: t("profit"), numeric: true }],
      rows: report.topProducts.map((p) => [p.sku, p.name, p.units, p.revenue, p.profit]),
    },
  ]);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bao-cao-ban-hang-${range.from}-${range.to}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
