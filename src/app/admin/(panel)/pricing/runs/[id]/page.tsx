import { Check, CircleCheck, Clock, ListOrdered, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/auth/roles";
import { BatchReviewOptions, BatchReviewSummary } from "@/components/admin/batch-review";
import type { BatchReviewView } from "@/server/catalog/batch-review-text";
import { prisma } from "@/lib/db";
import { applyRunAction, cancelRunAction } from "@/server/pricing/actions";
import { changePct } from "@/server/pricing/formula";
import { getRun } from "@/server/pricing/queries";
import { FORMULA_VERSION } from "@/server/pricing/runs";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm } from "@/components/admin/action-form";
import { Badge, DataTable, Notice, Page, PageHeader, StatCard, Td } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { fmtDate, fmtDateTime, fmtInt } from "@/lib/format";
import { convertVndToMmk, rateDisplay } from "@/server/pricing/formula";
import { getNumberSetting } from "@/server/settings";
import { priceRisks } from "@/server/pricing/risks";

const RUN_TONE = { PREVIEW: "warning", APPLIED: "success", CANCELLED: "neutral" } as const;
const LINE_TONE = { PENDING: "warning", APPLIED: "success", SKIPPED: "neutral" } as const;
/** Thay đổi giá vượt ngưỡng này (%) được tô nổi để kiểm tra lại. */
const BIG_CHANGE = 20;
const SKIP_REASONS = ["UNCHANGED", "PRICE_CHANGED", "INPUT_CHANGED", "CANCELLED", "LEGACY"] as const;

export default async function PriceRunPage({ params }: PageProps<"/admin/pricing/runs/[id]">) {
  const user = await requirePagePermission("pricing:manage");
  const uplineBp = await getNumberSetting("affiliate.uplineRateBp");
  const commissionBp = (await getNumberSetting("affiliate.defaultRateBp")) + uplineBp;
  const { id } = await params;
  const [t, run, lastReview] = await Promise.all([
    getTranslations("Pricing"),
    getRun(id),
    prisma.auditLog.findFirst({ where: { entity: "PriceUpdateRun", entityId: id, action: "pricing.apply.review" }, orderBy: { createdAt: "desc" }, select: { data: true } }),
  ]);
  if (!run) notFound();
  const now = new Date();
  const open = run.status === "PREVIEW";
  // D1: bản tạo trước khi có nguồn giá theo phiếu ghi sổ / fingerprint, hoặc quá hạn → không áp được nữa.
  const expired = open && (run.formulaVersion < FORMULA_VERSION || !run.expiresAt || run.expiresAt <= now);
  const editable = open && !expired;
  const pending = run.lines.filter((l) => l.status === "PENDING").length;
  const appliedCount = run.lines.filter((l) => l.status === "APPLIED").length;
  const bigChanges = run.lines.filter((l) => Math.abs(changePct(l.oldPriceMmk, l.newPriceMmk) ?? 0) >= BIG_CHANGE).length;
  // P24: cột theo cách tính giá của kho — MMK: vốn MMK + lãi cố định; VN: vốn VND + phí ship (MMK).
  const mmk = run.location?.pricingMode === "LOCAL_MMK";
  const vn = run.shipMmkPerKg != null;
  const extra = run.location ? (mmk ? t("profitCol") : t("shipCol")) : null;
  const skipLabel = (r: string | null) => (r && (SKIP_REASONS as readonly string[]).includes(r) ? t(`skipReason.${r as (typeof SKIP_REASONS)[number]}`) : null);

  const table = (
    <DataTable
      head={[
        editable ? t("select") : <span key="sel" className="sr-only">{t("select")}</span>,
        t("sku"),
        t("product"),
        mmk ? t("costMmk") : vn ? t("purchaseCost") : t("cost"),
        ...(extra ? [extra] : []),
        ...(vn ? [t("weight")] : []),
        t("source"),
        t("oldPrice"),
        t("newPrice"),
        t("change"),
        t("status"),
      ]}
    >
      {run.lines.map((l) => {
        const pct = changePct(l.oldPriceMmk, l.newPriceMmk);
        const pendingLine = l.status === "PENDING";
        const stale = editable && pendingLine && l.currentPriceMmk !== l.oldPriceMmk;
        const costMmk = l.costMmk ?? (l.costVnd != null && run.rate ? convertVndToMmk(l.costVnd, run.rate) : null);
        const risks = priceRisks({ oldPriceMmk: l.oldPriceMmk, priceMmk: l.newPriceMmk, costMmk, shipMmk: l.shipMmk ?? 0, commissionBp, fixedCommissionMmk: l.fixedCommissionMmk, uplineBp });
        return (
          <tr key={l.variantId} className={cn(stale && "bg-warning-subtle")} data-testid="run-line">
            <Td>
              {editable && pendingLine && (
                <input type="checkbox" name="variantId" value={l.variantId} defaultChecked={!stale} aria-label={l.sku} />
              )}
            </Td>
            <Td className="font-mono text-xs">{l.sku}</Td>
            <Td>
              {l.name}
              {stale && <div className="text-xs text-warning">{t("changedSince")}</div>}
              {risks.lowMargin && (
                <p className="text-xs text-warning">
                  {l.fixedCommissionMmk != null
                    ? t("lowMarginWarningFixed", { profit: fmtInt(risks.profit), fixed: fmtInt(l.fixedCommissionMmk), rate: uplineBp / 100 })
                    : t("lowMarginWarning", { profit: fmtInt(risks.profit), rate: commissionBp / 100 })}
                </p>
              )}
              {risks.largeChange && <p className="text-xs text-warning">{t("largeChangeWarning")}</p>}
            </Td>
            <Td className="text-right tabular-nums">{fmtInt(mmk ? l.costMmk : l.costVnd)}</Td>
            {extra && <Td className="text-right tabular-nums">{fmtInt(mmk ? l.profitMmk : l.shipMmk)}</Td>}
            {vn && (
              <Td className="text-right tabular-nums">
                {fmtInt(l.weightGrams)}
                {l.weightFromComponents && <div className="text-xs text-muted-foreground">{t("weightFromComponents")}</div>}
              </Td>
            )}
            <Td className="text-xs">
              {l.source ? (
                <>
                  <Link href={`/admin/inventory/documents/${l.source.document.id}`} className="font-mono text-primary underline">
                    {l.source.document.code}
                  </Link>
                  <div>
                    <Link href={`/admin/inventory/batches/${l.source.batch.id}`} className="underline">
                      {l.source.batch.lotNo}
                    </Link>
                    {l.source.postedAt && <span className="text-muted-foreground"> · {fmtDate(l.source.postedAt)}</span>}
                  </div>
                </>
              ) : l.isBundle ? (
                <span className="text-muted-foreground">{t("sourceCombo")}</span>
              ) : (
                "—"
              )}
            </Td>
            <Td className="text-right tabular-nums">{fmtInt(l.oldPriceMmk)}</Td>
            <Td className="text-right font-medium tabular-nums">{fmtInt(l.newPriceMmk)}</Td>
            <Td className={cn("text-right tabular-nums", pct != null && Math.abs(pct) >= BIG_CHANGE && "font-medium text-destructive")}>
              {pct == null ? "—" : `${pct > 0 ? "+" : ""}${pct}%`}
            </Td>
            <Td>
              <Badge tone={LINE_TONE[l.status]}>{t(`lineStatus.${l.status}`)}</Badge>
              {skipLabel(l.skipReason) && <div className="text-xs text-muted-foreground">{skipLabel(l.skipReason)}</div>}
            </Td>
          </tr>
        );
      })}
    </DataTable>
  );

  return (
    <Page>
      <PageHeader title={t("runTitle", { date: fmtDateTime(run.createdAt) })} back={{ href: "/admin/pricing?tab=runs", label: t("back") }} />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Badge tone={RUN_TONE[run.status]}>{t(`st.${run.status}`)}</Badge>
        {open && appliedCount > 0 && <span data-testid="run-partial">{t("partial", { applied: appliedCount, pending })}</span>}
        {open && run.expiresAt && <span className="text-muted-foreground">{t("expiresAt", { date: fmtDateTime(run.expiresAt) })}</span>}
        {run.location && (
          <span>
            {t("warehouse")}: {run.location.name}
          </span>
        )}
        {run.rate && (
          <span>
            {t("rate")}: <span className="tabular-nums">{rateDisplay(run.rate).vndPerMmk}</span>
          </span>
        )}
        {run.marginPct != null && (
          <span>
            {t("marginPct")}: {run.marginPct.toString()}%
          </span>
        )}
        {run.shipMmkPerKg != null && <span>{t("shipShort", { n: fmtInt(run.shipMmkPerKg) })}</span>}
        {mmk && <span>{t("fixedProfit")}</span>}
        <span>
          {t("roundTo")}: {fmtInt(run.roundTo)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<ListOrdered />} tone="brand" value={fmtInt(run.lines.length)} label={t("statLines")} />
        <StatCard icon={<Clock />} tone="warning" value={fmtInt(pending)} label={t("statPending")} />
        <StatCard icon={<TriangleAlert />} tone="danger" value={fmtInt(bigChanges)} label={t("statBig", { pct: BIG_CHANGE })} />
        <StatCard icon={<CircleCheck />} tone="success" value={fmtInt(appliedCount)} label={t("statApplied")} />
      </div>
      {expired && <Notice tone="danger">{t("expired")}</Notice>}
      {lastReview?.data && (
        <Notice className="p-4">
          <BatchReviewSummary review={lastReview.data as unknown as BatchReviewView} />
        </Notice>
      )}
      {run.skippedVariants.length > 0 && (
        <details className="rounded-xl border bg-card px-4 py-3 text-sm" data-testid="run-skipped">
          <summary className="cursor-pointer font-medium">{t("skippedTitle", { count: run.skippedVariants.length })}</summary>
          <ul className="mt-2 space-y-1 text-xs">
            {(["NO_COST", "NO_WEIGHT", "NO_PROFIT", "PRICE_ZERO"] as const).map((reason) => {
              const skus = run.skippedVariants.filter((s) => s.reason === reason).map((s) => s.sku);
              return skus.length > 0 ? (
                <li key={reason}>
                  <span className="font-medium">{t(`skippedReason.${reason}`)}:</span> <span className="font-mono">{skus.join(", ")}</span>
                </li>
              ) : null;
            })}
          </ul>
        </details>
      )}
      {editable && pending > 0 ? (
        <>
          <ActionForm action={applyRunAction} submitLabel={t("apply")} confirm={t("applyConfirm")} icon={<Check aria-hidden />}>
            <input type="hidden" name="runId" value={run.id} />
            {table}
            {can(user.role, "catalog:manage") && <BatchReviewOptions canApprove={can(user.role, "catalog:approve")} />}
          </ActionForm>
          <ActionButton action={cancelRunAction} fields={{ runId: run.id }} label={t("cancelRun")} icon={<X aria-hidden />} iconOnly={false} variant="outline" />
        </>
      ) : (
        <>
          {table}
          {open && <ActionButton action={cancelRunAction} fields={{ runId: run.id }} label={t("cancelRun")} icon={<X aria-hidden />} iconOnly={false} variant="outline" />}
        </>
      )}
    </Page>
  );
}
