import { getTranslations } from "next-intl/server";
import { fmtDate, fmtInt } from "@/lib/format";
import { siteUrl } from "@/lib/site";
import { requireAffiliate } from "@/server/auth/session";
import { bpToPercent } from "@/server/affiliates/commission";
import { teamOverview } from "@/server/affiliates/affiliates";
import { Badge, Stat } from "@/components/admin/ui";
import { CopyButton } from "@/components/ctv/copy-button";

/** Tuyến dưới (P11c): link mời + CTV mình tuyển trực tiếp và hoa hồng tầng trên — không có thông tin khách. */
export default async function CtvTeamPage() {
  const user = await requireAffiliate();
  const [t, ta, team] = await Promise.all([getTranslations("Ctv"), getTranslations("Affiliates"), teamOverview(user.affiliateId)]);
  const inviteLink = `${siteUrl()}/ctv/join?inv=${user.code}`;
  const amount = (n: number) => `${fmtInt(n)} MMK`;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">{t("team.title")}</h1>

      <section className="space-y-2 rounded-2xl border bg-card p-4 shadow-sm">
        <h2 className="font-medium">{t("team.inviteLink")}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2.5 text-sm" data-testid="ctv-invite-link">
            {inviteLink}
          </code>
          <CopyButton text={inviteLink} label={t("copy")} done={t("copied")} />
        </div>
        <p className="text-xs text-muted-foreground">{t("team.inviteHint", { percent: bpToPercent(team.uplineRateBp) })}</p>
        {team.pendingApplications > 0 && (
          <p className="text-sm" data-testid="ctv-pending-apps">
            {t("team.pendingApps", { count: team.pendingApplications })}
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Stat label={t("team.pending")} value={amount(team.total.pendingMmk)} testId="ctv-team-pending" />
        <Stat label={t("team.payable")} value={amount(team.total.payableMmk)} />
        <Stat label={t("team.paid")} value={amount(team.total.paidMmk)} />
      </div>

      <section className="space-y-2">
        <h2 className="font-medium">
          {t("team.members")} ({team.children.length})
        </h2>
        {team.children.length === 0 ? (
          <p className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">{t("team.empty")}</p>
        ) : (
          <ul className="space-y-2">
            {team.children.map((c) => (
              <li key={c.id} className="rounded-2xl border bg-card p-3 shadow-sm" data-testid="ctv-team-member">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {c.user.name} <span className="font-mono text-xs text-muted-foreground">{c.code}</span>
                  </span>
                  {!c.active && <Badge tone="danger">{ta("locked")}</Badge>}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t("team.joined", { date: fmtDate(c.createdAt) })} ·{" "}
                  {t("team.month", { orders: c.monthOrders, sales: fmtInt(c.monthSalesMmk) })}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                  <span>
                    <span className="block text-xs text-muted-foreground">{ta("commissionState.pending")}</span>
                    <span className="tabular-nums">{fmtInt(c.commission.pendingMmk)}</span>
                  </span>
                  <span>
                    <span className="block text-xs text-muted-foreground">{ta("commissionState.payable")}</span>
                    <span className="tabular-nums">{fmtInt(c.commission.payableMmk)}</span>
                  </span>
                  <span>
                    <span className="block text-xs text-muted-foreground">{ta("statPaid")}</span>
                    <span className="tabular-nums">{fmtInt(c.commission.paidMmk)}</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
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
      </section>
    </div>
  );
}
