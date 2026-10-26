import { getTranslations } from "next-intl/server";
import { fmtDateTime, fmtInt } from "@/lib/format";
import { requireAffiliate } from "@/server/auth/session";
import { getAffiliate } from "@/server/affiliates/affiliates";
import { getNumberSetting } from "@/server/settings";
import { Stat } from "@/components/admin/ui";

export default async function CtvPayoutsPage() {
  const user = await requireAffiliate();
  const [t, ta, a, holdDays] = await Promise.all([
    getTranslations("Ctv"),
    getTranslations("Affiliates"),
    getAffiliate(user.affiliateId),
    getNumberSetting("affiliate.holdDays"),
  ]);
  const s = a!.summary;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">{t("payoutsTitle")}</h1>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Stat label={t("payableNow")} value={`${fmtInt(s.payableMmk)} MMK`} testId="ctv-payable" />
        <Stat label={ta("statPending")} value={`${fmtInt(s.pendingMmk)} MMK`} />
        <Stat label={ta("statPaid")} value={`${fmtInt(s.paidMmk)} MMK`} testId="ctv-paid" />
      </div>
      <p className="text-xs text-muted-foreground">
        {t("split", {
          salePending: fmtInt(s.sale.pendingMmk),
          salePayable: fmtInt(s.sale.payableMmk),
          teamPending: fmtInt(s.upline.pendingMmk),
          teamPayable: fmtInt(s.upline.payableMmk),
        })}
      </p>
      <p className="text-xs text-muted-foreground">{t("holdHint", { days: holdDays })}</p>

      <section className="space-y-2 rounded-2xl border bg-card p-4">
        <h2 className="font-medium">{t("payoutInfo")}</h2>
        <p className="text-sm whitespace-pre-line">{a!.payoutInfo || t("payoutInfoEmpty")}</p>
        <p className="text-xs text-muted-foreground">{t("payoutInfoHint")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">{t("history2")}</h2>
        {a!.payouts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("payoutsEmpty")}</p>
        ) : (
          <ul className="divide-y rounded-2xl border bg-card text-sm">
            {a!.payouts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 p-3" data-testid="ctv-payout">
                <span>
                  {fmtDateTime(p.paidAt)}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {t("payoutLines", {
                      sale: p.lines.filter((l) => l.kind === "SALE").length,
                      team: p.lines.filter((l) => l.kind === "UPLINE").length,
                    })}
                    {p.note && ` · ${p.note}`}
                  </span>
                </span>
                <span className="font-medium tabular-nums">{fmtInt(p.amountMmk)} MMK</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
