import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { listShipments } from "@/server/inventory/queries";
import { DataTable, Page, PageHeader, Td } from "@/components/admin/ui";
import { ShipmentCreateForm } from "@/components/admin/shipment-forms";
import { fmtDay, fmtInt } from "@/lib/format";

export default async function ShipmentsPage() {
  await requirePagePermission("shipment:manage");
  const [t, shipments] = await Promise.all([getTranslations("Ship"), listShipments()]);
  return (
    <Page>
      <PageHeader title={t("title")} />
      <DataTable stack empty={t("empty")} head={[t("code"), t("method"), t("departedAt"), t("batches"), t("totalCosts")]}>
        {shipments.map((s) => (
          <tr key={s.id}>
            <Td>
              <Link href={`/admin/shipments/${s.id}`} className="font-mono text-xs text-primary underline">
                {s.code}
              </Link>
            </Td>
            <Td label={t("method")}>{t(s.allocationMethod)}</Td>
            <Td label={t("departedAt")}>{fmtDay(s.departedAt)}</Td>
            <Td label={t("batches")} className="text-right">{s._count.batches}</Td>
            <Td label={t("totalCosts")} className="text-right tabular-nums">{fmtInt(s.costs.reduce((a, c) => a + c.amountVnd, 0))}</Td>
          </tr>
        ))}
      </DataTable>
      <section className="max-w-xl rounded-lg border p-4">
        <h2 className="mb-3 font-medium">{t("new")}</h2>
        <ShipmentCreateForm />
      </section>
    </Page>
  );
}
