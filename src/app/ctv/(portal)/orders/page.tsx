import { getTranslations } from "next-intl/server";
import { fmtInt } from "@/lib/format";
import { requireAffiliate } from "@/server/auth/session";
import type { CommissionState } from "@/server/affiliates/commission";
import { affiliateOrders, currentMonth } from "@/server/affiliates/affiliates";
import { FilterBar, FilterButton, Page, PageHeader, fieldClass, fieldLabelClass } from "@/components/admin/ui";
import { MonthSelect } from "@/components/admin/month-select";
import { CtvOrdersTable } from "@/components/ctv/ctv-orders-table";
import { cn } from "@/lib/utils";

const STATES: CommissionState[] = ["pending", "payable", "void"];
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");

/** Đơn của tôi — thanh lọc + bảng theo chuẩn admin (FilterBar, DataTable stack), 18/11/2026. */
export default async function CtvOrdersPage({ searchParams }: PageProps<"/ctv/orders">) {
  const user = await requireAffiliate();
  const sp = await searchParams;
  const month = str(sp.month) || currentMonth();
  const rawState = str(sp.state);
  const state = (STATES as string[]).includes(rawState) ? (rawState as CommissionState) : undefined;
  const [t, ta, orders] = await Promise.all([
    getTranslations("Ctv"),
    getTranslations("Affiliates"),
    affiliateOrders(user.affiliateId, { month, state }),
  ]);
  const totalCommission = orders.reduce((s, o) => s + o.commission.commissionMmk, 0);

  return (
    <Page>
      <PageHeader title={t("nav.orders")} />
      <FilterBar>
        {/* Điện thoại: ô tháng cả hàng (nhãn tháng dài, vd "tháng 11 năm 2026"); ô hoa hồng + nút Lọc hàng dưới. */}
        <label className={cn(fieldLabelClass, "min-w-0 flex-[1_1_100%] sm:flex-none")}>
          <span className="text-muted-foreground">{ta("month")}</span>
          {/* Ô chọn tháng theo ngôn ngữ giao diện (ô month của trình duyệt hiện theo ngôn ngữ máy — 18/11/2026). */}
          <MonthSelect name="month" value={month} className="sm:w-48" />
        </label>
        <label className={cn(fieldLabelClass, "min-w-0 flex-[1_1_10rem] sm:flex-none")}>
          <span className="text-muted-foreground">{ta("state")}</span>
          <select name="state" defaultValue={state ?? ""} className={cn(fieldClass, "sm:w-auto")}>
            <option value="">{ta("allStates")}</option>
            {STATES.map((s) => (
              <option key={s} value={s}>
                {ta(`commissionState.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <FilterButton>{ta("filter")}</FilterButton>
      </FilterBar>
      <p className="text-sm text-muted-foreground">
        {ta("ordersCount", { count: orders.length })} · {ta("colCommission")}:{" "}
        <span className="font-medium text-foreground tabular-nums">{fmtInt(totalCommission)} MMK</span>
      </p>
      <CtvOrdersTable orders={orders} empty={ta("ordersEmpty")} />
    </Page>
  );
}
