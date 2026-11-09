import { Trash2 } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { getShipment } from "@/server/inventory/queries";
import { markArrivedAction, removeShipmentCostAction } from "@/server/inventory/actions";
import { ActionButton } from "@/components/admin/action-button";
import { AllocateForm, AttachBatchForm, ShipmentCostForm } from "@/components/admin/shipment-forms";
import { shipmentAllocationStatus } from "@/server/inventory/shipments";
import { prisma } from "@/lib/db";
import { DataTable, Page, PageHeader, Td } from "@/components/admin/ui";
import { fmtDateTime, fmtDay, fmtInt } from "@/lib/format";
import { rateDisplay } from "@/server/pricing/formula";
import { buttonVariants } from "@/components/ui/button-variants";

export default async function ShipmentPage({ params }: PageProps<"/admin/shipments/[id]">) {
  await requirePagePermission("shipment:manage");
  const { id } = await params;
  const [t, td, s] = await Promise.all([getTranslations("Ship"), getTranslations("Docs"), getShipment(id)]);
  if (!s) notFound();
  const [allocation, unlinked] = await Promise.all([shipmentAllocationStatus(id), prisma.batch.findMany({ where: { shipmentId: null, unitCostVnd: { not: null }, ledger: { some: { document: { type: "RECEIVE", status: "POSTED" } } } }, orderBy: { createdAt: "desc" }, take: 200, include: { variant: { select: { sku: true } } } })]);
  const total = s.costs.reduce((a, c) => a + c.amountVnd, 0);

  return (
    <Page>
      <PageHeader title={`${t("title")} · ${s.code}`} back={{ href: "/admin/shipments", label: td("back") }} />
      <p className="flex flex-wrap items-center gap-3 text-sm" data-testid="shipment-dates">
        <span>
          {t("departedAt")}: {fmtDay(s.departedAt)}
        </span>
        <span>
          {t("arrivedAt")}: {fmtDay(s.arrivedAt)}
        </span>
        {!s.arrivedAt && (
          <ActionButton action={markArrivedAction} fields={{ shipmentId: s.id }} label={t("markArrived")} variant="outline" />
        )}
      </p>

      <section className="space-y-3">
        <h2 className="font-medium">
          {t("costs")} — {t("totalCosts")}: <span className="tabular-nums">{fmtInt(total)}</span>
        </h2>
        <DataTable head={[t("costs"), t("amount"), t("note"), ""]}>
          {s.costs.map((c) => (
            <tr key={c.id}>
              <Td>{t(c.type)}</Td>
              <Td className="text-right tabular-nums">{fmtInt(c.amountVnd)}</Td>
              <Td>{c.note}</Td>
              <Td>
                <form action={removeShipmentCostAction}>
                  <input type="hidden" name="costId" value={c.id} />
                  <input type="hidden" name="shipmentId" value={s.id} />
                  <button type="submit" className={buttonVariants({ variant: "destructive", size: "icon-lg" })} title={td("remove")} aria-label={td("remove")}><Trash2 aria-hidden className="size-4 shrink-0" /></button>
                </form>
              </Td>
            </tr>
          ))}
        </DataTable>
        <ShipmentCostForm shipmentId={s.id} />
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">{t("batches")}</h2>
        <p className="text-sm text-muted-foreground">{t("receiveHint")}</p>
        <DataTable head={["SKU", td("lotNo"), td("expiry"), t("colUnit"), t("colLanded"), t("colRate"), t("colLandedMmk")]}>
          {s.batches.map((b) => (
            <tr key={b.id}>
              <Td className="font-mono text-xs">{b.variant.sku}</Td>
              <Td className="font-mono text-xs">{b.lotNo}</Td>
              <Td>{fmtDay(b.expiryDate)}</Td>
              <Td className="text-right tabular-nums">{fmtInt(b.unitCostVnd)}</Td>
              <Td className="text-right tabular-nums">{fmtInt(b.landedCostVnd)}</Td>
              <Td className="text-right tabular-nums">{b.rate ? rateDisplay(b.rate).vndPerMmk : "—"}</Td>
              <Td className="text-right tabular-nums">{fmtInt(b.landedCostMmk)}</Td>
            </tr>
          ))}
        </DataTable>
        <AllocateForm shipmentId={s.id} method={s.allocationMethod} />
        <p role="status" data-testid="allocation-state">{t(`allocationState.${allocation.state}`)}</p>
        <p className="text-sm text-muted-foreground">{t("allocationHelp")}</p>
        <AttachBatchForm shipmentId={s.id} batches={unlinked.map(b => ({ id: b.id, sku: b.variant.sku, lotNo: b.lotNo }))} />
        <h3 className="font-medium">{t("allocationHistory")}</h3>
        <DataTable head={[t("allocatedAt"), t("method"), t("allocatedBy"), t("fingerprint")] }>{allocation.history.map(h => <tr key={h.id}><Td>{fmtDateTime(h.createdAt)}</Td><Td>{t(h.method)}</Td><Td>{h.createdByName}</Td><Td><span className="font-mono text-xs break-all">{h.fingerprint}</span><details className="mt-2"><summary className="cursor-pointer">{t("allocationDetails")}</summary><DataTable head={[td("lotNo"), t("allocatedVnd"), t("colLanded")]}>{h.results.map(r=><tr key={r.key}><Td>{s.batches.find(b=>b.id===r.key)?.lotNo ?? r.key}</Td><Td>{fmtInt(r.allocatedVnd)}</Td><Td>{fmtInt(r.landedUnitVnd)}</Td></tr>)}</DataTable></details></Td></tr>)}</DataTable>
      </section>
    </Page>
  );
}
