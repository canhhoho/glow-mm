import { Calculator } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { batchDetail, loadThresholds } from "@/server/inventory/overview";
import { ExpiryTag } from "@/components/admin/stock-parts";
import { Badge, DataTable, Page, PageHeader, Td } from "@/components/admin/ui";
import { fmtDateTime, fmtDay, fmtInt } from "@/lib/format";
import { rateDisplay } from "@/server/pricing/formula";
import { cn } from "@/lib/utils";
import { ActionForm } from "@/components/admin/action-form";
import { resolveBatchExpiryAction, estimateBatchCostAction } from "@/server/inventory/actions";
import { lastShipRate } from "@/server/pricing/queries";
import { fieldClass } from "@/components/admin/ui";
import { can } from "@/server/auth/roles";
import { inventoryCost } from "@/server/inventory/cost";

/** Lịch sử lô (P9c): thông tin lô, tồn hiện tại theo vị trí, các dòng sổ kho kèm tồn luỹ kế. */
export default async function BatchPage({ params }: PageProps<"/admin/inventory/batches/[id]">) {
  const user = await requirePagePermission("stock:view");
  const { id } = await params;
  const [detail, th, t, ti, td, lastShip] = await Promise.all([
    batchDetail(id),
    loadThresholds(),
    getTranslations("Batch"),
    getTranslations("Inventory"),
    getTranslations("Docs"),
    lastShipRate(),
  ]);
  if (!detail) notFound();
  const { batch, entries } = detail;
  const now = new Date();
  const cost = inventoryCost(batch);

  const info: [string, React.ReactNode][] = [
    [t("expiry"), <ExpiryTag key="e" date={batch.expiryDate} status={batch.expiryStatus} now={now} t={ti} th={th} />],
    [t("mfg"), fmtDay(batch.mfgDate)],
    // P24: lô mua bằng MMK (Kho Chi) không có giá VND / tỷ giá — chỉ hiện giá vốn MMK.
    ...(batch.unitCostMmk == null
      ? ([
          [t("unitCostVnd"), fmtInt(batch.unitCostVnd)],
          [t("landedVnd"), fmtInt(batch.landedCostVnd)],
        ] as [string, React.ReactNode][])
      : []),
    [t("costMmk"), cost.unitCostMmk == null ? ti("unallocated") : fmtInt(cost.unitCostMmk)],
    [ti("costStatus"), ti(`cost${cost.costStatus}`)],
    ...(cost.costStatus === "ESTIMATED" ? ([
      [td("estimateShip"), fmtInt(batch.estimatedShipMmkPerKg)],
      [ti("estimateWeight"), fmtInt(batch.estimatedWeightGrams)],
    ] as [string, React.ReactNode][]) : []),
    ...(batch.unitCostMmk == null ? ([[t("rate"), batch.rate ? rateDisplay(batch.rate).vndPerMmk : "—"]] as [string, React.ReactNode][]) : []),
    [
      t("shipment"),
      batch.shipment ? (
        <Link key="s" href={`/admin/shipments/${batch.shipment.id}`} className="font-mono text-primary underline">
          {batch.shipment.code}
        </Link>
      ) : (
        "—"
      ),
    ],
    [t("createdAt"), fmtDateTime(batch.createdAt)],
  ];

  return (
    <Page>
      <PageHeader
        title={t("title", { lotNo: batch.lotNo })}
        back={{ href: `/admin/inventory?q=${encodeURIComponent(batch.lotNo)}&view=lots`, label: ti("title") }}
      />
      <p className="-mt-3 text-sm text-muted-foreground">
        {detail.name} ({batch.variant.label}) · <span className="font-mono">{batch.variant.sku}</span>
      </p>

      <dl className="grid grid-cols-2 gap-3 rounded-xl border p-4 text-sm sm:grid-cols-4">
        {info.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {batch.unitCostVnd != null && batch.landedCostVnd == null && batch.landedCostMmk == null && can(user.role, "stock:receive") && (
        <ActionForm action={estimateBatchCostAction} submitLabel={ti("estimateAction")} okText={ti("estimateSaved")} className="space-y-3 rounded-lg border p-4" icon={<Calculator aria-hidden className="size-4 shrink-0" />}>
          <input type="hidden" name="batchId" value={batch.id} />
          <p className="text-sm text-muted-foreground">{ti("estimateExistingHelp")}</p>
          <label className="grid max-w-sm gap-1 text-sm">
            <span>{td("estimateShip")}</span>
            <input required type="number" name="shipMmkPerKg" min={0} max={2147483647} step={1} defaultValue={batch.estimatedShipMmkPerKg ?? lastShip ?? ""} className={fieldClass} />
          </label>
        </ActionForm>
      )}
      {batch.expiryStatus === "UNKNOWN" && can(user.role, "stock:receive") && <ActionForm action={resolveBatchExpiryAction} submitLabel={ti("resolveExpiry")} okText={ti("expiryDated")} className="space-y-2 rounded-lg border p-4">
        <input type="hidden" name="batchId" value={batch.id} />
        <p className="text-sm text-muted-foreground">{ti("resolveHelp")}</p>
        <label className="grid max-w-xs gap-1 text-sm"><span>{t("expiry")}</span><input type="date" name="expiryDate" required className="rounded-md border px-3 py-2" /></label>
      </ActionForm>}

      <section className="space-y-2">
        <h2 className="font-medium">
          {t("balances")} <span className="text-muted-foreground tabular-nums">· {fmtInt(detail.total)}</span>
        </h2>
        <DataTable empty={t("noBalance")} head={[t("colLocation"), t("colType"), t("qty")]}>
          {batch.balances.map((b) => (
            <tr key={`${b.locationId}|${b.stockType}`} data-testid="balance-row">
              <Td>
                <span className="font-mono text-xs">{b.location.code}</span> · {ti(`loc.${b.location.type}`)}
              </Td>
              <Td>
                <Badge tone={b.stockType === "TESTER" ? "brand" : "neutral"}>{ti(b.stockType)}</Badge>
              </Td>
              <Td className="text-right tabular-nums">{fmtInt(b.qty)}</Td>
            </tr>
          ))}
        </DataTable>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">{t("ledger")}</h2>
        <DataTable
          empty="—"
          head={[t("colTime"), t("colDoc"), t("colLocation"), t("colType"), t("colDelta"), t("colAfter"), t("colOrder")]}
        >
          {entries.map((e) => (
            <tr key={e.id} data-testid="ledger-row">
              <Td className="whitespace-nowrap tabular-nums">{fmtDateTime(e.createdAt)}</Td>
              <Td>
                <Link href={`/admin/inventory/documents/${e.document.id}`} className="font-mono text-xs text-primary underline">
                  {e.document.code}
                </Link>{" "}
                <span className="text-muted-foreground">{td(e.document.type)}</span>
                {e.document.reason && <div className="text-xs text-muted-foreground">{e.document.reason}</div>}
              </Td>
              <Td className="font-mono text-xs">{e.location.code}</Td>
              <Td>
                <Badge tone={e.stockType === "TESTER" ? "brand" : "neutral"}>{ti(e.stockType)}</Badge>
              </Td>
              <Td className={cn("text-right font-medium tabular-nums", e.qtyDelta < 0 ? "text-destructive" : "text-success")}>
                {e.qtyDelta > 0 ? `+${fmtInt(e.qtyDelta)}` : fmtInt(e.qtyDelta)}
              </Td>
              <Td className="text-right tabular-nums">{fmtInt(e.balanceAfter)}</Td>
              <Td>
                {e.document.order && (
                  <Link href={`/admin/orders/${e.document.order.id}`} className="font-mono text-xs text-primary underline">
                    {e.document.order.code}
                  </Link>
                )}
              </Td>
            </tr>
          ))}
        </DataTable>
      </section>
    </Page>
  );
}
