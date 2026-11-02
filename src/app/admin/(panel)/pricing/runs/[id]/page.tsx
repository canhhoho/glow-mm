import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { applyRunAction, cancelRunAction } from "@/server/pricing/actions";
import { changePct } from "@/server/pricing/formula";
import { getRun } from "@/server/pricing/queries";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm } from "@/components/admin/action-form";
import { Badge, DataTable, Page, PageHeader, Td } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { fmtDateTime, fmtInt } from "@/lib/format";

const RUN_TONE = { PREVIEW: "warning", APPLIED: "success", CANCELLED: "neutral" } as const;
/** Thay đổi giá vượt ngưỡng này (%) được tô nổi để kiểm tra lại. */
const BIG_CHANGE = 20;

export default async function PriceRunPage({ params }: PageProps<"/admin/pricing/runs/[id]">) {
  await requirePagePermission("pricing:manage");
  const { id } = await params;
  const [t, run] = await Promise.all([getTranslations("Pricing"), getRun(id)]);
  if (!run) notFound();
  const editable = run.status === "PREVIEW";

  const table = (
    <DataTable
      head={[
        editable ? t("select") : "",
        t("sku"),
        t("product"),
        t("cost"),
        t("oldPrice"),
        t("newPrice"),
        t("change"),
      ]}
    >
      {run.lines.map((l) => {
        const pct = changePct(l.oldPriceMmk, l.newPriceMmk);
        const stale = editable && l.currentPriceMmk !== l.oldPriceMmk;
        const same = l.newPriceMmk === l.oldPriceMmk;
        return (
          <tr key={l.variantId} className={cn(stale && "bg-amber-50 dark:bg-amber-950/30")}>
            <Td>
              {editable && (
                <input
                  type="checkbox"
                  name="variantId"
                  value={l.variantId}
                  defaultChecked={!same && !stale}
                  disabled={same}
                  aria-label={l.sku}
                />
              )}
            </Td>
            <Td className="font-mono text-xs">{l.sku}</Td>
            <Td>
              {l.name}
              {stale && <div className="text-xs text-amber-700 dark:text-amber-400">{t("changedSince")}</div>}
            </Td>
            <Td className="text-right tabular-nums">{fmtInt(l.costVnd)}</Td>
            <Td className="text-right tabular-nums">{fmtInt(l.oldPriceMmk)}</Td>
            <Td className="text-right font-medium tabular-nums">{fmtInt(l.newPriceMmk)}</Td>
            <Td
              className={cn(
                "text-right tabular-nums",
                pct != null && Math.abs(pct) >= BIG_CHANGE && "font-medium text-destructive",
              )}
            >
              {pct == null ? "—" : `${pct > 0 ? "+" : ""}${pct}%`}
            </Td>
          </tr>
        );
      })}
    </DataTable>
  );

  return (
    <Page>
      <PageHeader
        title={t("runTitle", { date: fmtDateTime(run.createdAt) })}
        back={{ href: "/admin/pricing", label: t("back") }}
      />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Badge tone={RUN_TONE[run.status]}>{t(`st.${run.status}`)}</Badge>
        <span>
          {t("rate")}: <span className="font-mono">{run.rate.mmkPerVnd.toString()}</span>
        </span>
        <span>
          {t("marginPct")}: {run.marginPct.toString()}%
        </span>
        <span>
          {t("roundTo")}: {fmtInt(run.roundTo)}
        </span>
      </div>
      {editable ? (
        <>
          <ActionForm action={applyRunAction} submitLabel={t("apply")} confirm={t("applyConfirm")}>
            <input type="hidden" name="runId" value={run.id} />
            {table}
          </ActionForm>
          <ActionButton action={cancelRunAction} fields={{ runId: run.id }} label={t("cancelRun")} variant="outline" />
        </>
      ) : (
        table
      )}
    </Page>
  );
}
