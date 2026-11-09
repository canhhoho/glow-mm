import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { fmtInt } from "@/lib/format";
import { siteUrl } from "@/lib/site";
import { requireAffiliate } from "@/server/auth/session";
import { bpToPercent } from "@/server/affiliates/commission";
import { affiliateOrders, getAffiliate } from "@/server/affiliates/affiliates";
import { getNumberSetting } from "@/server/settings";
import { PageHeader, Stat } from "@/components/admin/ui";
import { CopyButton } from "@/components/ctv/copy-button";
import { CtvOrderCard } from "@/components/ctv/ctv-order-card";
import { storeCard } from "@/components/store/ui";
import { cn } from "@/lib/utils";

export default async function CtvHomePage() {
  const user = await requireAffiliate();
  const [t, ta, a, orders, holdDays] = await Promise.all([
    getTranslations("Ctv"),
    getTranslations("Affiliates"),
    getAffiliate(user.affiliateId),
    affiliateOrders(user.affiliateId),
    getNumberSetting("affiliate.holdDays"),
  ]);
  const refLink = `${siteUrl()}/?ref=${user.code}`;
  const s = a!.summary;

  return (
    <div className="space-y-4">
      <PageHeader title={t("hello", { name: user.name })} />

      <section className={cn(storeCard, "space-y-2")}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">{t("refLink")}</h2>
          <span className="text-sm text-muted-foreground">
            {ta("code")}: <span className="font-mono text-foreground">{user.code}</span> ·{" "}
            {t("rate", { percent: bpToPercent(a!.commissionRateBp) })}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2.5 text-sm" data-testid="ctv-ref-link">
            {refLink}
          </code>
          <CopyButton text={refLink} label={t("copy")} done={t("copied")} />
        </div>
        <p className="text-xs text-muted-foreground">{t("refHint")}</p>
        <p className="text-xs text-muted-foreground">{t("productLinkHint", { code: user.code })}</p>
      </section>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label={ta("statOrders")} value={fmtInt(s.monthOrders)} />
        <Stat label={ta("statSales")} value={fmtInt(s.monthSalesMmk)} />
        <Stat label={ta("statPending")} value={fmtInt(s.pendingMmk)} />
        <Stat label={ta("statPayable")} value={fmtInt(s.payableMmk)} href="/ctv/payouts" testId="ctv-payable" />
        <Stat label={ta("statPaid")} value={fmtInt(s.paidMmk)} href="/ctv/payouts" />
      </div>
      <p className="text-xs text-muted-foreground" data-testid="ctv-split">
        {t("split", {
          salePending: fmtInt(s.sale.pendingMmk),
          salePayable: fmtInt(s.sale.payableMmk),
          teamPending: fmtInt(s.upline.pendingMmk),
          teamPayable: fmtInt(s.upline.payableMmk),
        })}
      </p>
      <p className="text-xs text-muted-foreground">{t("holdHint", { days: holdDays })}</p>

      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-medium">{t("recent")}</h2>
          <Link href="/ctv/orders" className="text-sm text-brand underline">
            {t("seeAll")}
          </Link>
        </div>
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">{ta("ordersEmpty")}</p>
        ) : (
          <ul className="space-y-2">
            {orders.slice(0, 5).map((o) => (
              <li key={o.id}>
                <CtvOrderCard order={o} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
