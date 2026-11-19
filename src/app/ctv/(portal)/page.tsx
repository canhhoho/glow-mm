import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Banknote, CircleCheck, Clock, ShoppingBag, Wallet } from "lucide-react";
import { fmtInt } from "@/lib/format";
import { siteUrl } from "@/lib/site";
import { requireAffiliate } from "@/server/auth/session";
import { affiliateOrders, getAffiliate } from "@/server/affiliates/affiliates";
import { getNumberSetting } from "@/server/settings";
import { Page, PageHeader, Section, StatCard } from "@/components/admin/ui";
import { CopyLink } from "@/components/ctv/copy-link";
import { CtvOrdersTable } from "@/components/ctv/ctv-orders-table";

/** Tổng quan cổng CTV — thành phần admin (Section, StatCard, DataTable), khung CTV giữ nguyên (18/11/2026). */
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
    <Page>
      <PageHeader title={t("hello", { name: user.name })} />

      <Section title={t("refLink")}>
        <p className="text-sm text-muted-foreground">
          {ta("code")}: <span className="font-mono text-foreground">{user.code}</span> · {t("rateByProduct")}
        </p>
        <CopyLink text={refLink} testId="ctv-ref-link" copy={t("copy")} copied={t("copied")} />
        <p className="text-xs text-muted-foreground">{t("refHint")}</p>
        <p className="text-xs text-muted-foreground">{t("productLinkHint", { code: user.code })}</p>
      </Section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard icon={<ShoppingBag />} tone="brand" label={ta("statOrders")} value={fmtInt(s.monthOrders)} />
        <StatCard icon={<Banknote />} tone="green" label={ta("statSales")} value={fmtInt(s.monthSalesMmk)} />
        <StatCard icon={<Clock />} tone="warning" label={ta("statPending")} value={fmtInt(s.pendingMmk)} />
        <StatCard icon={<Wallet />} tone="success" label={ta("statPayable")} value={fmtInt(s.payableMmk)} href="/ctv/payouts" testId="ctv-payable" />
        <StatCard icon={<CircleCheck />} tone="neutral" label={ta("statPaid")} value={fmtInt(s.paidMmk)} href="/ctv/payouts" />
      </div>
      <div className="space-y-1 text-xs text-muted-foreground">
        <p data-testid="ctv-split">
          {t("split", {
            salePending: fmtInt(s.sale.pendingMmk),
            salePayable: fmtInt(s.sale.payableMmk),
            teamPending: fmtInt(s.upline.pendingMmk),
            teamPayable: fmtInt(s.upline.payableMmk),
          })}
        </p>
        <p>{t("holdHint", { days: holdDays })}</p>
      </div>

      <Section
        title={t("recent")}
        actions={
          <Link href="/ctv/orders" className="text-sm text-primary underline">
            {t("seeAll")}
          </Link>
        }
      >
        <CtvOrdersTable orders={orders.slice(0, 5)} empty={ta("ordersEmpty")} />
      </Section>
    </Page>
  );
}
