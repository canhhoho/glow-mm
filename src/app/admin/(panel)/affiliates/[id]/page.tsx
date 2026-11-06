import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { fmtDate, fmtDateTime, fmtInt } from "@/lib/format";
import { siteUrl } from "@/lib/site";
import { requirePagePermission } from "@/server/auth/session";
import { MIN_STAFF_PASSWORD } from "@/server/auth/roles";
import { bpToPercent, type CommissionState } from "@/server/affiliates/commission";
import {
  recordPayoutAction,
  resetAffiliatePasswordAction,
  setAffiliateActiveAction,
  setAffiliateParentAction,
  updateAffiliateAction,
} from "@/server/affiliates/actions";
import { affiliateOptions, affiliateOrders, currentMonth, getAffiliate, teamOrders } from "@/server/affiliates/affiliates";
import { getNumberSetting } from "@/server/settings";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm } from "@/components/admin/action-form";
import { FileField } from "@/components/admin/file-field";
import { AffiliateFields, CommissionBadge } from "@/components/admin/affiliate-parts";
import { OrderStatusBadge } from "@/components/admin/order-badges";
import { Badge, DataTable, fieldClass, Page, PageHeader, Stat, Td } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ctv/copy-button";
import { cn } from "@/lib/utils";

const STATES: CommissionState[] = ["pending", "payable", "void"];
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");

export default async function AffiliatePage({ params, searchParams }: PageProps<"/admin/affiliates/[id]">) {
  await requirePagePermission("affiliates:manage");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const month = str(sp.month) || currentMonth();
  const rawState = str(sp.state);
  const state = (STATES as string[]).includes(rawState) ? (rawState as CommissionState) : undefined;
  const [t, tc, a, orders, holdDays, options, team, uplineBp] = await Promise.all([
    getTranslations("Affiliates"),
    getTranslations("Ctv"),
    getAffiliate(id),
    affiliateOrders(id, { month: month === "all" ? undefined : month, state }),
    getNumberSetting("affiliate.holdDays"),
    affiliateOptions(),
    teamOrders(id),
    getNumberSetting("affiliate.uplineRateBp"),
  ]);
  if (!a) notFound();
  const refLink = `${siteUrl()}/?ref=${a.code}`;

  return (
    <Page>
      <PageHeader title={a.user.name} back={{ href: "/admin/affiliates", label: t("back") }} />
      {sp.created && <p className="text-sm text-emerald-700 dark:text-emerald-400">{t("created")}</p>}
      {sp.approved && <p className="text-sm text-emerald-700 dark:text-emerald-400">{t("apps.approvedNote")}</p>}
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span className="font-mono">{a.user.email}</span>
        <Badge tone={a.active ? "success" : "danger"}>{a.active ? t("active") : t("locked")}</Badge>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        {(
          [
            ["refLink", refLink, "ref-link"],
            ["inviteLink", `${siteUrl()}/ctv/join?inv=${a.code}`, "invite-link"],
          ] as const
        ).map(([key, link, testId]) => (
          <div key={key} className="space-y-1">
            <dt className="text-xs text-muted-foreground">{t(key)}</dt>
            <dd className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs" data-testid={testId}>
                {link}
              </code>
              <CopyButton text={link} label={tc("copy")} done={tc("copied")} />
            </dd>
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label={t("statOrders")} value={fmtInt(a.summary.monthOrders)} />
        <Stat label={t("statSales")} value={fmtInt(a.summary.monthSalesMmk)} />
        <Stat label={t("statPending")} value={fmtInt(a.summary.pendingMmk)} />
        <Stat label={t("statPayable")} value={fmtInt(a.summary.payableMmk)} testId="stat-payable" />
        <Stat label={t("statPaid")} value={fmtInt(a.summary.paidMmk)} />
      </div>
      <p className="text-xs text-muted-foreground">{t("holdHint", { days: holdDays })}</p>

      <section className="grid gap-4 rounded-lg border p-4 md:grid-cols-2" data-testid="affiliate-tree">
        <div className="space-y-2">
          <h2 className="font-medium">{t("tree.parent")}</h2>
          <p className="text-sm" data-testid="affiliate-parent">
            {a.parent ? (
              <Link href={`/admin/affiliates/${a.parent.id}`} className="text-primary underline">
                {a.parent.code} — {a.parent.user.name}
              </Link>
            ) : (
              <span className="text-muted-foreground">{t("tree.noParent")}</span>
            )}
            {a.parent && !a.parent.active && <span className="ml-2 text-xs text-destructive">({t("locked")})</span>}
          </p>
          <ActionForm action={setAffiliateParentAction} submitLabel={t("tree.save")} okText={t("saved")} variant="outline">
            <input type="hidden" name="id" value={a.id} />
            <select name="parentId" defaultValue={a.parentId ?? ""} aria-label={t("tree.parent")} className={cn(fieldClass, "max-w-sm")}>
              <option value="">{t("tree.noParent")}</option>
              {options
                .filter((o) => o.id !== a.id && !a.children.some((c) => c.id === o.id))
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
            </select>
          </ActionForm>
          <p className="text-xs text-muted-foreground">{t("tree.parentHint")}</p>
        </div>
        <div className="space-y-2">
          <h2 className="font-medium">
            {t("tree.children")} ({a.children.length})
          </h2>
          {a.children.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("tree.noChildren")}</p>
          ) : (
            <ul className="space-y-1 text-sm" data-testid="affiliate-children">
              {a.children.map((c) => (
                <li key={c.id}>
                  <Link href={`/admin/affiliates/${c.id}`} className="text-primary underline">
                    {c.code} — {c.user.name}
                  </Link>
                  <span className="ml-2 text-xs text-muted-foreground">{fmtDate(c.createdAt)}</span>
                  {!c.active && <span className="ml-2 text-xs text-destructive">({t("locked")})</span>}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            {t("tree.upline")}: {fmtInt(a.summary.upline.pendingMmk)} / {fmtInt(a.summary.upline.payableMmk)} /{" "}
            {fmtInt(a.summary.upline.paidMmk)}
          </p>
        </div>
      </section>

      <section id="affiliate-payouts" className="scroll-mt-20 space-y-2 rounded-lg border p-4">
        <h2 className="font-medium">{t("due")}</h2>
        {a.due.entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("dueEmpty")}</p>
        ) : (
          <>
            <p className="text-sm" data-testid="due-summary">
              {t("dueSummary", { count: a.due.entries.length, amount: fmtInt(a.due.totalMmk) })}
            </p>
            <ul className="flex flex-wrap gap-1.5 text-xs">
              {a.due.entries.map((e) => (
                <li key={`${e.orderId}-${e.kind}`} className="rounded border px-1.5 py-0.5 font-mono">
                  {e.code}
                  {e.kind === "UPLINE" && <span className="ml-1 font-sans text-muted-foreground">({t("lineKind.UPLINE")})</span>}:{" "}
                  {fmtInt(e.commission.dueMmk)}
                </li>
              ))}
            </ul>
            {a.due.totalMmk > 0 && (
              <ActionForm
                action={recordPayoutAction}
                submitLabel={t("pay")}
                okText={t("paid")}
                confirm={t("payConfirm", { amount: fmtInt(a.due.totalMmk), name: a.user.name })}
                className="space-y-3"
              >
                <input type="hidden" name="id" value={a.id} />
                {a.payoutInfo && <p className="text-sm whitespace-pre-line">{a.payoutInfo}</p>}
                <label className="grid content-start gap-1 text-sm">
                  <span>{t("payNote")}</span>
                  <input name="note" maxLength={500} className={fieldClass} />
                </label>
                <label className="grid content-start gap-1 text-sm">
                  <span>{t("payProof")}</span>
                  <FileField name="proof" accept="image/jpeg,image/png,image/webp,application/pdf" />
                </label>
              </ActionForm>
            )}
          </>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">{t("orders")}</h2>
        <form className="flex flex-wrap items-end gap-2" role="search">
          <label className="grid content-start gap-1 text-sm">
            <span className="text-muted-foreground">{t("month")}</span>
            <input name="month" type="month" defaultValue={month === "all" ? "" : month} className={cn(fieldClass, "w-44")} />
          </label>
          <label className="grid content-start gap-1 text-sm">
            <span className="text-muted-foreground">{t("state")}</span>
            <select name="state" defaultValue={state ?? ""} className={cn(fieldClass, "w-auto")}>
              <option value="">{t("allStates")}</option>
              {STATES.map((s) => (
                <option key={s} value={s}>
                  {t(`commissionState.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <Button size="lg" type="submit" variant="outline">
            {t("filter")}
          </Button>
        </form>
        <DataTable
          empty={t("ordersEmpty")}
          head={[t("colOrder"), t("colDate"), t("colCustomer"), t("colSource"), t("colGoods"), t("colCommission"), t("colOrderStatus")]}
          numeric={[4, 5]}
        >
          {orders.map((o) => (
            <tr key={o.id} data-testid="affiliate-order">
              <Td>
                <Link href={`/admin/orders/${o.id}`} className="font-mono text-xs text-primary underline">
                  {o.code}
                </Link>
              </Td>
              <Td className="whitespace-nowrap">{fmtDate(o.createdAt)}</Td>
              <Td>
                {o.recipientName}
                <div className="font-mono text-xs text-muted-foreground">{o.recipientPhone}</div>
              </Td>
              <Td className="text-xs">{o.affiliateSource && t(`source.${o.affiliateSource}`)}</Td>
              <Td className="text-right tabular-nums">{fmtInt(o.commission.baseMmk)}</Td>
              <Td className="text-right tabular-nums">
                <div className="flex flex-col items-end gap-1">
                  <span>
                    {fmtInt(o.commission.commissionMmk)}
                    <span className="ml-1 text-xs text-muted-foreground">({bpToPercent(o.commissionRateBp ?? 0)}%)</span>
                  </span>
                  <CommissionBadge state={o.commission.state} />
                </div>
              </Td>
              <Td>
                <OrderStatusBadge status={o.status} />
              </Td>
            </tr>
          ))}
        </DataTable>
      </section>

      {team.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">
            {t("teamOrders")} ({team.length})
          </h2>
          <DataTable head={[t("colOrder"), t("colDate"), t("colCtv"), t("colGoods"), t("colUpline"), t("colOrderStatus")]} numeric={[3, 4]}>
            {team.map((o) => (
              <tr key={o.id} data-testid="team-order">
                <Td>
                  <Link href={`/admin/orders/${o.id}`} className="font-mono text-xs text-primary underline">
                    {o.code}
                  </Link>
                </Td>
                <Td className="whitespace-nowrap">{fmtDate(o.createdAt)}</Td>
                <Td className="text-xs">
                  {o.seller ? (
                    <>
                      <span className="font-mono">{o.seller.code}</span> — {o.seller.user.name}
                    </>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td className="text-right tabular-nums">{fmtInt(o.uplineCommission?.baseMmk ?? 0)}</Td>
                <Td className="text-right tabular-nums">
                  {o.uplineCommission && (
                    <div className="flex flex-col items-end gap-1">
                      <span>
                        {fmtInt(o.uplineCommission.commissionMmk)}
                        <span className="ml-1 text-xs text-muted-foreground">({bpToPercent(o.uplineRateBp ?? 0)}%)</span>
                      </span>
                      <CommissionBadge state={o.uplineCommission.state} />
                    </div>
                  )}
                </Td>
                <Td>
                  <OrderStatusBadge status={o.status} />
                </Td>
              </tr>
            ))}
          </DataTable>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-medium">{t("payouts")}</h2>
        <DataTable empty={t("payoutsEmpty")} head={[t("colPaidAt"), t("colAmount"), t("colOrders"), t("colNote"), ""]} numeric={[1]}>
          {a.payouts.map((p) => (
            <tr key={p.id} data-testid="payout-row">
              <Td className="whitespace-nowrap">{fmtDateTime(p.paidAt)}</Td>
              <Td className="text-right font-medium tabular-nums">{fmtInt(p.amountMmk)} MMK</Td>
              <Td className="tabular-nums">{p._count.lines}</Td>
              <Td className="text-xs">{p.note}</Td>
              <Td>
                {p.proofFile && (
                  <a href={p.proofFile.url} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
                    {t("proof")}
                  </a>
                )}
              </Td>
            </tr>
          ))}
        </DataTable>
      </section>

      <div className="grid gap-6 md:grid-cols-2 [&>*]:min-w-0">
        <section className="space-y-2">
          <h2 className="font-medium">{t("profile")}</h2>
          <ActionForm action={updateAffiliateAction} submitLabel={t("save")} okText={t("saved")} className="space-y-3">
            <input type="hidden" name="id" value={a.id} />
            <AffiliateFields
              values={{
                name: a.user.name,
                email: a.user.email,
                phone: a.phone,
                code: a.code,
                commissionPercent: bpToPercent(a.commissionRateBp),
                uplinePercent: a.uplineRateBp == null ? null : bpToPercent(a.uplineRateBp),
                payoutInfo: a.payoutInfo,
              }}
              globalUplinePercent={bpToPercent(uplineBp)}
            />
          </ActionForm>
        </section>
        <div className="space-y-6">
          <section className="space-y-2">
            <h2 className="font-medium">{t("resetTitle")}</h2>
            <ActionForm action={resetAffiliatePasswordAction} submitLabel={t("reset")} okText={t("resetDone")} className="space-y-3">
              <input type="hidden" name="id" value={a.id} />
              <label className="grid content-start gap-1 text-sm">
                <span>{t("tempPassword")}</span>
                <input
                  name="password"
                  type="password"
                  required
                  minLength={MIN_STAFF_PASSWORD}
                  maxLength={128}
                  autoComplete="new-password"
                  className={fieldClass}
                />
              </label>
            </ActionForm>
          </section>
          <section className="space-y-2">
            <h2 className="font-medium">{t("access")}</h2>
            <p className="text-xs text-muted-foreground">{a.active ? t("lockHint") : t("unlockHint")}</p>
            <ActionButton
              action={setAffiliateActiveAction}
              fields={{ id: a.id, active: String(!a.active) }}
              label={a.active ? t("lock") : t("unlock")}
              variant={a.active ? "destructive" : "outline"}
              confirm={a.active ? t("lockConfirm", { name: a.user.name }) : undefined}
            />
          </section>
        </div>
      </div>
    </Page>
  );
}
