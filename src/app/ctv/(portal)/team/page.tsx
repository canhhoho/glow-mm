import { getTranslations } from "next-intl/server";
import { CircleCheck, Clock, Wallet } from "lucide-react";
import { fmtDate, fmtInt } from "@/lib/format";
import { siteUrl } from "@/lib/site";
import { requireAffiliate } from "@/server/auth/session";
import { bpToPercent } from "@/server/affiliates/commission";
import { teamOverview } from "@/server/affiliates/affiliates";
import { Badge, DataTable, Page, PageHeader, Section, StatCard, Td } from "@/components/admin/ui";
import { CopyLink } from "@/components/ctv/copy-link";

/** Tuyến dưới (P11c): link mời + CTV mình tuyển trực tiếp và hoa hồng tầng trên — không có thông tin khách. */
export default async function CtvTeamPage() {
  const user = await requireAffiliate();
  const [t, ta, team] = await Promise.all([getTranslations("Ctv"), getTranslations("Affiliates"), teamOverview(user.affiliateId)]);
  const inviteLink = `${siteUrl()}/ctv/join?inv=${user.code}`;
  const amount = (n: number) => `${fmtInt(n)} MMK`;

  return (
    <Page>
      <PageHeader title={t("team.title")} />

      <Section title={t("team.inviteLink")}>
        <CopyLink text={inviteLink} testId="ctv-invite-link" copy={t("copy")} copied={t("copied")} />
        <p className="text-xs text-muted-foreground">{t("team.inviteHint", { percent: bpToPercent(team.uplineRateBp) })}</p>
        {team.pendingApplications > 0 && (
          <p className="text-sm" data-testid="ctv-pending-apps">
            {t("team.pendingApps", { count: team.pendingApplications })}
          </p>
        )}
      </Section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={<Clock />} tone="warning" label={t("team.pending")} value={amount(team.total.pendingMmk)} testId="ctv-team-pending" />
        <StatCard icon={<Wallet />} tone="success" label={t("team.payable")} value={amount(team.total.payableMmk)} />
        <StatCard icon={<CircleCheck />} tone="neutral" label={t("team.paid")} value={amount(team.total.paidMmk)} />
      </div>

      <Section title={`${t("team.members")} (${team.children.length})`}>
        <DataTable
          stack
          empty={t("team.empty")}
          numeric={[2, 3, 4]}
          head={[ta("colCtv"), ta("colMonthSales"), ta("commissionState.pending"), ta("commissionState.payable"), ta("statPaid")]}
        >
          {team.children.map((c) => (
            <tr key={c.id} data-testid="ctv-team-member">
              <Td>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.user.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{c.code}</span>
                  {!c.active && <Badge tone="danger">{ta("locked")}</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">{t("team.joined", { date: fmtDate(c.createdAt) })}</div>
              </Td>
              <Td label={ta("colMonthSales")} className="text-xs">
                {t("team.month", { orders: c.monthOrders, sales: fmtInt(c.monthSalesMmk) })}
              </Td>
              <Td label={ta("commissionState.pending")} numeric>{fmtInt(c.commission.pendingMmk)}</Td>
              <Td label={ta("commissionState.payable")} numeric>{fmtInt(c.commission.payableMmk)}</Td>
              <Td label={ta("statPaid")} numeric>{fmtInt(c.commission.paidMmk)}</Td>
            </tr>
          ))}
        </DataTable>
        {(team.former.pendingMmk !== 0 || team.former.payableMmk !== 0 || team.former.paidMmk !== 0) && (
          <p className="text-xs text-muted-foreground">
            {t("team.former", {
              pending: fmtInt(team.former.pendingMmk),
              payable: fmtInt(team.former.payableMmk),
              paid: fmtInt(team.former.paidMmk),
            })}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{t("team.privacy")}</p>
      </Section>
    </Page>
  );
}
