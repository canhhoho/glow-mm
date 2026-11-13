import { LockKeyhole, LockKeyholeOpen, Trash2, Wallet, KeyRound } from "lucide-react";
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
  deleteAffiliateAction,
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
import { Badge, DataTable, fieldClass, fieldLabelClass, FilterBar, FilterButton, Notice, Page, PageHeader, Section, Stat, Td } from "@/components/admin/ui";
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
      <PageHeader
        title={a.user.name}
        back={{ href: "/admin/affiliates", label: t("back") }}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{a.user.email}</span>
            <Badge tone={a.active ? "success" : "danger"}>{a.active ? t("active") : t("locked")}</Badge>
          </span>
        }
      />
      {sp.created && <Notice tone="success">{t("created")}</Notice>}
      {sp.approved && <Notice tone="success">{t("apps.approvedNote")}</Notice>}
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label={t("statOrders")} value={fmtInt(a.summary.monthOrders)} />
        <Stat label={t("statSales")} value={fmtInt(a.summary.monthSalesMmk)} />
        <Stat label={t("statPending")} value={fmtInt(a.summary.pendingMmk)} />
        <Stat label={t("statPayable")} value={fmtInt(a.summary.payableMmk)} testId="stat-payable" />
        <Stat label={t("statPaid")} value={fmtInt(a.summary.paidMmk)} />
      </div>
      <p className="text-xs text-muted-foreground">{t("holdHint", { days: holdDays })}</p>

      <Section className="grid gap-4 space-y-0 md:grid-cols-2" testId="affiliate-tree">
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
            {a.parent && !a.parent.active && <span className="ml-2"><Badge tone="danger">{t("locked")}</Badge></span>}
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
                  {!c.active && <span className="ml-2"><Badge tone="danger">{t("locked")}</Badge></span>}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            {t("tree.upline")}: {fmtInt(a.summary.upline.pendingMmk)} / {fmtInt(a.summary.upline.payableMmk)} /{" "}
            {fmtInt(a.summary.upline.paidMmk)}
          </p>
        </div>
      </Section>

      <Section id="affiliate-payouts" title={t("due")} className="scroll-mt-20 space-y-2">
        {a.due.entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("dueEmpty")}</p>
        ) : (
          <>
            <p className="text-sm" data-testid="due-summary">
              {t("dueSummary", { count: a.due.entries.length, amount: fmtInt(a.due.totalMmk) })}
            </p>
            <ul className="flex flex-wrap gap-1.5 text-xs">
              {a.due.entries.map((e) => (
                <li key={`${e.orderId}-${e.kind}`} className="rounded-md border bg-card px-1.5 py-0.5">
                  {/* Chỉ mã + số dùng font-mono: chữ thường giữ font Myanmar tự host (class font-sans trỏ sai tên font). */}
                  <span className="font-mono">{e.code}</span>
                  {e.kind === "UPLINE" && <span className="ml-1 text-muted-foreground">({t("lineKind.UPLINE")})</span>}
                  <span className="font-mono">
                    :{" "}
                    {fmtInt(e.commission.dueMmk)}
                  </span>
                </li>
              ))}
            </ul>
            {a.due.totalMmk > 0 && (
              <ActionForm
                action={recordPayoutAction}
                submitLabel={t("pay")}
                okText={t("paid")}
                confirm={t("payConfirm", { amount: fmtInt(a.due.totalMmk), name: a.user.name })}
                className="space-y-3" icon={<Wallet aria-hidden />}
              >
                <input type="hidden" name="id" value={a.id} />
                {a.payoutInfo && <p className="text-sm whitespace-pre-line">{a.payoutInfo}</p>}
                <label className={fieldLabelClass}>
                  <span>{t("payNote")}</span>
                  <input name="note" maxLength={500} className={fieldClass} />
                </label>
                <label className={fieldLabelClass}>
                  <span>{t("payProof")}</span>
                  <FileField name="proof" accept="image/jpeg,image/png,image/webp,application/pdf" />
                </label>
              </ActionForm>
            )}
          </>
        )}
      </Section>

      <Section title={t("orders")}>
        <FilterBar>
          <label className={fieldLabelClass}>
            <span className="text-muted-foreground">{t("month")}</span>
            <input name="month" type="month" defaultValue={month === "all" ? "" : month} className={cn(fieldClass, "w-44")} />
          </label>
          <label className={fieldLabelClass}>
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
          <FilterButton>{(await getTranslations("Common"))("filter")}</FilterButton>
        </FilterBar>
        <DataTable
          stack
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
              <Td label={t("colDate")} className="whitespace-nowrap">{fmtDate(o.createdAt)}</Td>
              <Td label={t("colCustomer")}>
                {o.recipientName}
                <div className="font-mono text-xs text-muted-foreground">{o.recipientPhone}</div>
              </Td>
              <Td label={t("colSource")} className="text-xs">{o.affiliateSource && t(`source.${o.affiliateSource}`)}</Td>
              <Td label={t("colGoods")} numeric>{fmtInt(o.commission.baseMmk)}</Td>
              <Td label={t("colCommission")} numeric>
                <div className="flex flex-col items-end gap-1 max-md:items-start">
                  <span>
                    {fmtInt(o.commission.commissionMmk)}
                    <span className="ml-1 text-xs text-muted-foreground">({bpToPercent(o.commissionRateBp ?? 0)}%)</span>
                  </span>
                  <CommissionBadge state={o.commission.state} />
                </div>
              </Td>
              <Td label={t("colOrderStatus")}>
                <OrderStatusBadge status={o.status} />
              </Td>
            </tr>
          ))}
        </DataTable>
      </Section>

      {team.length > 0 && (
        <Section title={<>{t("teamOrders")} ({team.length})</>}>
          <DataTable stack head={[t("colOrder"), t("colDate"), t("colCtv"), t("colGoods"), t("colUpline"), t("colOrderStatus")]} numeric={[3, 4]}>
            {team.map((o) => (
              <tr key={o.id} data-testid="team-order">
                <Td>
                  <Link href={`/admin/orders/${o.id}`} className="font-mono text-xs text-primary underline">
                    {o.code}
                  </Link>
                </Td>
                <Td label={t("colDate")} className="whitespace-nowrap">{fmtDate(o.createdAt)}</Td>
                <Td label={t("colCtv")} className="text-xs">
                  {o.seller ? (
                    <>
                      <span className="font-mono">{o.seller.code}</span> — {o.seller.user.name}
                    </>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td label={t("colGoods")} numeric>{fmtInt(o.uplineCommission?.baseMmk ?? 0)}</Td>
                <Td label={t("colUpline")} numeric>
                  {o.uplineCommission && (
                    <div className="flex flex-col items-end gap-1 max-md:items-start">
                      <span>
                        {fmtInt(o.uplineCommission.commissionMmk)}
                        <span className="ml-1 text-xs text-muted-foreground">({bpToPercent(o.uplineRateBp ?? 0)}%)</span>
                      </span>
                      <CommissionBadge state={o.uplineCommission.state} />
                    </div>
                  )}
                </Td>
                <Td label={t("colOrderStatus")}>
                  <OrderStatusBadge status={o.status} />
                </Td>
              </tr>
            ))}
          </DataTable>
        </Section>
      )}

      <Section title={t("payouts")}>
        <DataTable stack empty={t("payoutsEmpty")} head={[t("colPaidAt"), t("colAmount"), t("colOrders"), t("colNote"), <span key="p" className="sr-only">{t("proof")}</span>]} numeric={[1, 2]}>
          {a.payouts.map((p) => (
            <tr key={p.id} data-testid="payout-row">
              <Td className="whitespace-nowrap">{fmtDateTime(p.paidAt)}</Td>
              <Td label={t("colAmount")} numeric className="font-medium">{fmtInt(p.amountMmk)} MMK</Td>
              <Td label={t("colOrders")} numeric>{p._count.lines}</Td>
              <Td label={t("colNote")} className="text-xs">{p.note}</Td>
              <Td label={t("proof")}>
                {p.proofFile && (
                  <a href={p.proofFile.url} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
                    {t("proof")}
                  </a>
                )}
              </Td>
            </tr>
          ))}
        </DataTable>
      </Section>

      <div className="grid gap-6 md:grid-cols-2 [&>*]:min-w-0">
        <Section id="profile" className="scroll-mt-20" title={t("profile")}>
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
        </Section>
        <div className="space-y-6">
          <Section title={t("resetTitle")}>
            <ActionForm action={resetAffiliatePasswordAction} submitLabel={t("reset")} okText={t("resetDone")} className="space-y-3" icon={<KeyRound aria-hidden />}>
              <input type="hidden" name="id" value={a.id} />
              <label className={fieldLabelClass}>
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
          </Section>
          <Section title={t("access")}>
            <p className="text-xs text-muted-foreground">{a.active ? t("lockHint") : t("unlockHint")}</p>
            <ActionButton
              action={setAffiliateActiveAction}
              fields={{ id: a.id, active: String(!a.active) }}
              label={a.active ? t("lock") : t("unlock")}
              variant={a.active ? "destructive" : "outline"}
              confirm={a.active ? t("lockConfirm", { name: a.user.name }) : undefined} iconOnly={false} icon={a.active ? <LockKeyhole aria-hidden /> : <LockKeyholeOpen aria-hidden />}
            />
            <p className="text-xs text-muted-foreground">{t("deleteHint")}</p>
            <ActionButton action={deleteAffiliateAction} fields={{ id: a.id }} label={t("delete")} variant="destructive" confirm={t("deleteConfirm", { name: a.user.name })} iconOnly={false} icon={<Trash2 aria-hidden />} />
          </Section>
        </div>
      </div>
    </Page>
  );
}
