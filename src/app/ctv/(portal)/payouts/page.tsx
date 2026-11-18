import { getTranslations } from "next-intl/server";
import { CircleCheck, Clock, Wallet } from "lucide-react";
import { fmtDateTime, fmtInt } from "@/lib/format";
import { requireAffiliate } from "@/server/auth/session";
import { getAffiliate } from "@/server/affiliates/affiliates";
import { getNumberSetting } from "@/server/settings";
import { DataTable, Page, PageHeader, Section, StatCard, Td } from "@/components/admin/ui";

/** Thanh toán hoa hồng — StatCard + Section + DataTable stack theo chuẩn admin (18/11/2026). */
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
    <Page>
      <PageHeader title={t("payoutsTitle")} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={<Wallet />} tone="success" label={t("payableNow")} value={`${fmtInt(s.payableMmk)} MMK`} testId="ctv-payable" />
        <StatCard icon={<Clock />} tone="warning" label={ta("statPending")} value={`${fmtInt(s.pendingMmk)} MMK`} />
        <StatCard icon={<CircleCheck />} tone="neutral" label={ta("statPaid")} value={`${fmtInt(s.paidMmk)} MMK`} testId="ctv-paid" />
      </div>
      <div className="space-y-1 text-xs text-muted-foreground">
        <p>
          {t("split", {
            salePending: fmtInt(s.sale.pendingMmk),
            salePayable: fmtInt(s.sale.payableMmk),
            teamPending: fmtInt(s.upline.pendingMmk),
            teamPayable: fmtInt(s.upline.payableMmk),
          })}
        </p>
        <p>{t("holdHint", { days: holdDays })}</p>
      </div>

      <Section title={t("payoutInfo")}>
        <p className="text-sm whitespace-pre-line">{a!.payoutInfo || t("payoutInfoEmpty")}</p>
        <p className="text-xs text-muted-foreground">{t("payoutInfoHint")}</p>
      </Section>

      <Section title={t("history2")}>
        <DataTable stack empty={t("payoutsEmpty")} numeric={[2]} head={[ta("colPaidAt"), ta("colNote"), ta("colAmount")]}>
          {a!.payouts.map((p) => (
            <tr key={p.id} data-testid="ctv-payout">
              <Td className="whitespace-nowrap">{fmtDateTime(p.paidAt)}</Td>
              <Td label={ta("colNote")} className="text-xs text-muted-foreground">
                {t("payoutLines", {
                  sale: p.lines.filter((l) => l.kind === "SALE").length,
                  team: p.lines.filter((l) => l.kind === "UPLINE").length,
                })}
                {p.note && ` · ${p.note}`}
              </Td>
              <Td label={ta("colAmount")} numeric className="font-medium">
                {fmtInt(p.amountMmk)} MMK
              </Td>
            </tr>
          ))}
        </DataTable>
      </Section>
    </Page>
  );
}
