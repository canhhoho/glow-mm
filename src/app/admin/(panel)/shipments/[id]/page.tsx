import { PackageCheck, Trash2 } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { requireFeature } from "@/server/feature-guard";
import { getShipment } from "@/server/inventory/queries";
import { markArrivedAction, removeShipmentCostAction } from "@/server/inventory/actions";
import { ActionButton } from "@/components/admin/action-button";
import { AllocateForm, AttachBatchForm, ShipmentCostForm } from "@/components/admin/shipment-forms";
import { shipmentAllocationStatus } from "@/server/inventory/shipments";
import { prisma } from "@/lib/db";
import { DataTable, Page, PageHeader, Section, Td } from "@/components/admin/ui";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit";
import { fmtDateTime, fmtDay, fmtInt } from "@/lib/format";
import { rateDisplay } from "@/server/pricing/formula";
import { buttonVariants } from "@/components/ui/button-variants";

export default async function ShipmentPage({ params }: PageProps<"/admin/shipments/[id]">) {
  requireFeature("shipments", { redirectTo: "/admin/inventory" });
  await requirePagePermission("shipment:manage");
  const { id } = await params;
  const [t, td, tc, s] = await Promise.all([getTranslations("Ship"), getTranslations("Docs"), getTranslations("Common"), getShipment(id)]);
  if (!s) notFound();
  const [allocation, unlinked] = await Promise.all([shipmentAllocationStatus(id), prisma.batch.findMany({ where: { shipmentId: null, unitCostVnd: { not: null }, ledger: { some: { document: { type: "RECEIVE", status: "POSTED" } } } }, orderBy: { createdAt: "desc" }, take: 200, include: { variant: { select: { sku: true } } } })]);
  const total = s.costs.reduce((a, c) => a + c.amountVnd, 0);

  return (
    <Page>
      <PageHeader title={`${t("title")} · ${s.code}`} back={{ href: "/admin/shipments", label: td("back") }} />
      <div className="flex flex-wrap items-center gap-3 text-sm" data-testid="shipment-dates">
        <span>
          {t("departedAt")}: {fmtDay(s.departedAt)}
        </span>
        <span>
          {t("arrivedAt")}: {fmtDay(s.arrivedAt)}
        </span>
        {!s.arrivedAt && (
          <ActionButton action={markArrivedAction} fields={{ shipmentId: s.id }} label={t("markArrived")} icon={<PackageCheck aria-hidden />} iconOnly={false} variant="outline" />
        )}
      </div>

      <Section
        title={
          <>
            {t("costs")} — {t("totalCosts")}: <span className="tabular-nums">{fmtInt(total)}</span>
          </>
        }
      >
        <DataTable numeric={[1]} empty={tc("noData")} head={[t("costs"), t("amount"), t("note"), <span key="a" className="sr-only">{tc("actions")}</span>]}>
          {s.costs.map((c) => (
            <tr key={c.id}>
              <Td>{t(c.type)}</Td>
              <Td numeric>{fmtInt(c.amountVnd)}</Td>
              <Td>{c.note}</Td>
              <Td>
                <form action={removeShipmentCostAction}>
                  <input type="hidden" name="costId" value={c.id} />
                  <input type="hidden" name="shipmentId" value={s.id} />
                  <ConfirmSubmitButton confirm={t("removeCostConfirm")} className={buttonVariants({ variant: "destructive", size: "icon-lg" })} title={td("remove")} aria-label={td("remove")}><Trash2 aria-hidden /></ConfirmSubmitButton>
                </form>
              </Td>
            </tr>
          ))}
        </DataTable>
        <ShipmentCostForm shipmentId={s.id} />
      </Section>

      <Section title={t("batches")}>
        <p className="text-sm text-muted-foreground">{t("receiveHint")}</p>
        <DataTable stack numeric={[3, 4, 5, 6]} empty={tc("noData")} head={[tc("sku"), td("lotNo"), td("expiry"), t("colUnit"), t("colLanded"), t("colRate"), t("colLandedMmk")]}>
          {s.batches.map((b) => (
            <tr key={b.id}>
              <Td className="font-mono text-xs">{b.variant.sku}</Td>
              <Td label={td("lotNo")} className="font-mono text-xs">{b.lotNo}</Td>
              <Td label={td("expiry")}>{fmtDay(b.expiryDate)}</Td>
              <Td label={t("colUnit")} numeric>{fmtInt(b.unitCostVnd)}</Td>
              <Td label={t("colLanded")} numeric>{fmtInt(b.landedCostVnd)}</Td>
              <Td label={t("colRate")} numeric>{b.rate ? rateDisplay(b.rate).vndPerMmk : "—"}</Td>
              <Td label={t("colLandedMmk")} numeric>{fmtInt(b.landedCostMmk)}</Td>
            </tr>
          ))}
        </DataTable>
        <AllocateForm shipmentId={s.id} method={s.allocationMethod} />
        <p role="status" className="text-sm font-medium" data-testid="allocation-state">{t(`allocationState.${allocation.state}`)}</p>
        <p className="text-sm text-muted-foreground">{t("allocationHelp")}</p>
        <AttachBatchForm shipmentId={s.id} batches={unlinked.map(b => ({ id: b.id, sku: b.variant.sku, lotNo: b.lotNo }))} />
        <h3 className="pt-2 font-medium">{t("allocationHistory")}</h3>
        <DataTable stack empty={tc("noData")} head={[t("allocatedAt"), t("method"), t("allocatedBy"), t("fingerprint")]}>{allocation.history.map(h => <tr key={h.id}><Td>{fmtDateTime(h.createdAt)}</Td><Td>{t(h.method)}</Td><Td>{h.createdByName}</Td><Td><span className="font-mono text-xs break-all">{h.fingerprint}</span><details className="mt-2"><summary className="cursor-pointer text-primary">{t("allocationDetails")}</summary><DataTable dense className="mt-2" numeric={[1, 2]} head={[td("lotNo"), t("allocatedVnd"), t("colLanded")]}>{h.results.map((r) => <tr key={r.key}><Td>{s.batches.find((b) => b.id === r.key)?.lotNo ?? r.key}</Td><Td numeric>{fmtInt(r.allocatedVnd)}</Td><Td numeric>{fmtInt(r.landedUnitVnd)}</Td></tr>)}</DataTable></details></Td></tr>)}</DataTable>
      </Section>
    </Page>
  );
}
