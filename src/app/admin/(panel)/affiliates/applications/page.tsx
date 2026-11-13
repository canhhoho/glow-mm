import { Check, X } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { fmtDateTime } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/session";
import { bpToPercent } from "@/server/affiliates/commission";
import { approveApplicationAction, rejectApplicationAction } from "@/server/affiliates/actions";
import { suggestAffiliateCode } from "@/server/affiliates/affiliates";
import { listApplications, pendingApplicationsCount } from "@/server/affiliates/applications";
import { getNumberSetting } from "@/server/settings";
import { ActionForm } from "@/components/admin/action-form";
import { Badge, DataTable, EmptyState, fieldClass, fieldLabelClass, Page, PageHeader, Section, Td } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

/** Duyệt đơn đăng ký CTV qua link mời (P11b). */
export default async function AffiliateApplicationsPage() {
  await requirePagePermission("affiliates:manage");
  const [t, pending, decided, defaultBp, pendingTotal] = await Promise.all([
    getTranslations("Affiliates"),
    listApplications("PENDING"),
    listApplications("DECIDED"),
    getNumberSetting("affiliate.defaultRateBp"),
    pendingApplicationsCount(),
  ]);

  return (
    <Page>
      <PageHeader title={t("apps.title")} description={t("apps.hint")} />
      {pendingTotal > 0 && (
        <p className="text-sm font-medium" data-testid="apps-pending-total">
          {t("apps.pendingTotal", { count: pendingTotal, shown: pending.length })}
        </p>
      )}

      {pending.length === 0 ? (
        <EmptyState>{t("apps.empty")}</EmptyState>
      ) : (
        <ul className="space-y-3">
          {pending.map((a) => (
            <li key={a.id} className="rounded-xl border bg-card p-4" data-testid="application">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <div className="font-medium">{a.name}</div>
                  <div className="text-sm text-muted-foreground">
                    <span className="font-mono">{a.phone}</span> · {a.email}
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  {t("apps.invitedBy")}:{" "}
                  <Link href={`/admin/affiliates/${a.inviter.id}`} className="text-primary underline">
                    {a.inviter.code} — {a.inviter.user.name}
                  </Link>
                  <div>{fmtDateTime(a.createdAt)}</div>
                </div>
              </div>
              <div className="mt-3 grid gap-4 md:grid-cols-[2fr_1fr]">
                <ActionForm action={approveApplicationAction} submitLabel={t("apps.approve")} className="space-y-2" icon={<Check aria-hidden className="size-4 shrink-0" />}>
                  <input type="hidden" name="id" value={a.id} />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className={fieldLabelClass}>
                      <span>{t("code")}</span>
                      <input
                        name="code"
                        required
                        minLength={4}
                        maxLength={12}
                        pattern="[A-Za-z0-9]{4,12}"
                        defaultValue={suggestAffiliateCode()}
                        className={cn(fieldClass, "font-mono uppercase")}
                      />
                    </label>
                    <label className={fieldLabelClass}>
                      <span>{t("percent")}</span>
                      <input
                        name="commissionPercent"
                        type="number"
                        required
                        min={0}
                        max={50}
                        step={0.01}
                        defaultValue={bpToPercent(defaultBp)}
                        className={fieldClass}
                      />
                    </label>
                  </div>
                  <label className={fieldLabelClass}>
                    <span>{t("payoutInfo")}</span>
                    <input name="payoutInfo" maxLength={500} className={fieldClass} />
                  </label>
                </ActionForm>
                <ActionForm
                  action={rejectApplicationAction}
                  submitLabel={t("apps.reject")}
                  okText={t("apps.rejected")}
                  variant="outline"
                  confirm={t("apps.rejectConfirm", { name: a.name })}
                  className="space-y-2" icon={<X aria-hidden className="size-4 shrink-0" />}
                >
                  <input type="hidden" name="id" value={a.id} />
                  <label className={fieldLabelClass}>
                    <span>{t("apps.reason")}</span>
                    <input name="note" maxLength={500} className={fieldClass} />
                  </label>
                </ActionForm>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Section title={t("apps.decided")}>
        <DataTable stack empty={t("apps.decidedEmpty")} head={[t("name"), t("apps.invitedBy"), t("status"), t("apps.reviewedAt"), <span key="a" className="sr-only">{t("view")}</span>]}>
          {decided.map((a) => (
            <tr key={a.id}>
              <Td>
                {a.name}
                <div className="text-xs text-muted-foreground">{a.email}</div>
              </Td>
              <Td label={t("apps.invitedBy")} className="font-mono text-xs">{a.inviter.code}</Td>
              <Td label={t("status")}>
                <Badge tone={a.status === "APPROVED" ? "success" : "danger"}>{t(`apps.status.${a.status}`)}</Badge>
                {a.note && <div className="text-xs text-muted-foreground">{a.note}</div>}
              </Td>
              <Td label={t("apps.reviewedAt")} className="text-xs whitespace-nowrap">{fmtDateTime(a.reviewedAt)}</Td>
              <Td>
                {a.affiliateId && (
                  <Link href={`/admin/affiliates/${a.affiliateId}`} className="text-sm text-primary underline">
                    {t("view")}
                  </Link>
                )}
              </Td>
            </tr>
          ))}
        </DataTable>
      </Section>
    </Page>
  );
}
