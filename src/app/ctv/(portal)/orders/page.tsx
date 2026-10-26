import { getTranslations } from "next-intl/server";
import { fmtInt } from "@/lib/format";
import { requireAffiliate } from "@/server/auth/session";
import type { CommissionState } from "@/server/affiliates/commission";
import { affiliateOrders, currentMonth } from "@/server/affiliates/affiliates";
import { fieldClass } from "@/components/admin/ui";
import { CtvOrderCard } from "@/components/ctv/ctv-order-card";
import { Button } from "@/components/ui/button";

const STATES: CommissionState[] = ["pending", "payable", "void"];
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");

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
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t("nav.orders")}</h1>
      <form className="flex flex-wrap items-end gap-2" role="search">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">{ta("month")}</span>
          <input name="month" type="month" defaultValue={month} className={`${fieldClass} h-10 w-44`} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">{ta("state")}</span>
          <select name="state" defaultValue={state ?? ""} className={`${fieldClass} h-10 w-auto`}>
            <option value="">{ta("allStates")}</option>
            {STATES.map((s) => (
              <option key={s} value={s}>
                {ta(`commissionState.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline" className="h-10">
          {ta("filter")}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        {orders.length} · {ta("colCommission")}: <span className="font-medium text-foreground tabular-nums">{fmtInt(totalCommission)} MMK</span>
      </p>
      {orders.length === 0 ? (
        <p className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">{ta("ordersEmpty")}</p>
      ) : (
        <ul className="space-y-2">
          {orders.map((o) => (
            <li key={o.id} data-testid="ctv-order">
              <CtvOrderCard order={o} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
