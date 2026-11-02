import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { getShipment } from "@/server/inventory/queries";
import { markArrivedAction, removeShipmentCostAction } from "@/server/inventory/actions";
import { ActionButton } from "@/components/admin/action-button";
import { AllocateForm, ShipmentCostForm } from "@/components/admin/shipment-forms";
import { DataTable, Page, PageHeader, Td } from "@/components/admin/ui";
import { fmtDay, fmtInt } from "@/lib/format";
import { rateDisplay } from "@/server/pricing/formula";

export default async function ShipmentPage({ params }: PageProps<"/admin/shipments/[id]">) {
  await requirePagePermission("shipment:manage");
  const { id } = await params;
  const [t, td, s] = await Promise.all([getTranslations("Ship"), getTranslations("Docs"), getShipment(id)]);
  if (!s) notFound();
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
                  <button type="submit" className="text-xs text-destructive underline">
                    {td("remove")}
                  </button>
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
      </section>
    </Page>
  );
}
