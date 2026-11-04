import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/auth/roles";
import { discardAction, restockAction } from "@/server/inventory/actions";
import { listQuarantine } from "@/server/inventory/quarantine";
import { sellableLocations } from "@/server/orders/admin-queries";
import { ActionForm } from "@/components/admin/action-form";
import { DataTable, fieldClass, Page, PageHeader, Td } from "@/components/admin/ui";
import { fmtDay, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

export default async function QuarantinePage() {
  const user = await requirePagePermission("stock:view");
  const [t, ti, rows, locations] = await Promise.all([
    getTranslations("Quarantine"),
    getTranslations("Inventory"),
    listQuarantine(),
    sellableLocations(),
  ]);
  const canRestock = can(user.role, "stock:transfer");
  const canDiscard = can(user.role, "stock:issue");

  return (
    <Page>
      <PageHeader title={t("title")} back={{ href: "/admin/inventory", label: ti("title") }} />
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
      <DataTable stack empty={t("empty")} head={[t("product"), t("lot"), t("qty"), t("orders"), ""]}>
        {rows.map((r) => {
          const hidden = (
            <>
              <input type="hidden" name="batchId" value={r.batchId} />
              <input type="hidden" name="fromId" value={r.locationId} />
              <input type="hidden" name="stockType" value={r.stockType} />
            </>
          );
          return (
            <tr key={`${r.batchId}|${r.locationId}|${r.stockType}`} data-testid="quarantine-row">
              <Td>
                <span className="font-mono text-xs">{r.sku}</span> {r.name}
                <div className="text-xs text-muted-foreground">
                  {r.location} · {ti(r.stockType)}
                </div>
              </Td>
              <Td label={t("lot")} className="font-mono text-xs whitespace-nowrap">
                {r.lotNo} · {r.expiryStatus === "NONE" ? ti("expiryNone") : r.expiryStatus === "UNKNOWN" ? ti("expiryUnknown") : fmtDay(r.expiryDate)}
              </Td>
              <Td label={t("qty")} className="text-right tabular-nums">{fmtInt(r.qty)}</Td>
              <Td label={t("orders")} className="text-xs">
                {r.orders.map((o) => (
                  <Link key={o.id} href={`/admin/orders/${o.id}`} className="block font-mono text-primary underline">
                    {o.code}
                  </Link>
                ))}
              </Td>
              <Td>
                <div className="flex flex-col gap-2">
                  {canRestock && locations.length > 0 && (
                    <ActionForm action={restockAction} submitLabel={t("restock")} okText={t("restocked")} className="flex flex-wrap items-end gap-2">
                      {hidden}
                      <input
                        name="qty"
                        type="number"
                        min={1}
                        max={r.qty}
                        defaultValue={r.qty}
                        aria-label={`${t("qty")} ${t("restock")}`}
                        className={cn(fieldClass, "w-20")}
                      />
                      <select name="toId" aria-label={t("restockTo")} defaultValue={locations[0].id} className={cn(fieldClass, "w-36")}>
                        {locations.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.code}
                          </option>
                        ))}
                      </select>
                    </ActionForm>
                  )}
                  {canDiscard && (
                    <ActionForm
                      action={discardAction}
                      submitLabel={t("discard")}
                      okText={t("discarded")}
                      variant="outline"
                      confirm={t("discardConfirm")}
                      className="flex flex-wrap items-end gap-2"
                    >
                      {hidden}
                      <input
                        name="qty"
                        type="number"
                        min={1}
                        max={r.qty}
                        defaultValue={r.qty}
                        aria-label={`${t("qty")} ${t("discard")}`}
                        className={cn(fieldClass, "w-20")}
                      />
                      <input name="reason" required placeholder={t("reason")} aria-label={t("reason")} className={cn(fieldClass, "w-40")} />
                    </ActionForm>
                  )}
                </div>
              </Td>
            </tr>
          );
        })}
      </DataTable>
    </Page>
  );
}
