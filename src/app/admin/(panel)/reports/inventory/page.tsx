import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { inboundShipments, slowMovers, stockByLocation } from "@/server/reports/queries";
import { DataTable, Notice, Page, PageHeader, Section, Td } from "@/components/admin/ui";
import { ReportsTabs } from "@/components/admin/reports-tabs";
import { fmtDay, fmtInt } from "@/lib/format";

/**
 * Báo cáo tồn kho: số liệu TỒN HIỆN TẠI (không theo kỳ) — tồn theo kho, hàng bán chậm, chuyến hàng đang về.
 * Các khối dời nguyên từ báo cáo Bán hàng; dùng cùng hàm `reports/queries.ts`, không thêm công thức mới.
 */
export default async function InventoryReportPage() {
  await requirePagePermission("reports:view");
  const [t, tc, tn, slow, inbound, stock] = await Promise.all([
    getTranslations("Reports"),
    getTranslations("Common"),
    getTranslations("Nav"),
    slowMovers(),
    inboundShipments(),
    stockByLocation(),
  ]);

  return (
    <Page>
      <PageHeader title={tn("inventoryReports")} description={t("inventoryBasis")} />
      <ReportsTabs active="inventory" />
      <Notice>{t("inventoryNow")}</Notice>
      <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <Section title={t("stock")}>
          <DataTable empty={t("empty")} tableClassName="min-w-[40rem]" numeric={[1, 2, 3, 4, 5]} head={[t("locType"), t("qty"), t("tester"), t("value"), t("estimatedQty"), t("noCost")]}>
            {stock.map((s) => (
              <tr key={s.code ?? "inactive"} data-testid={`stock-${s.code ?? "inactive"}`}>
                <Td className="whitespace-nowrap">{s.name ?? t("inactiveLocations")}</Td>
                <Td numeric>{fmtInt(s.qty)}</Td>
                <Td numeric>{fmtInt(s.testerQty)}</Td>
                <Td numeric>{fmtInt(s.valueMmk)}</Td>
                <Td numeric>{s.estimatedQty ? fmtInt(s.estimatedQty) : "—"}</Td>
                <Td numeric>{s.missingCost ? fmtInt(s.missingCost) : "—"}</Td>
              </tr>
            ))}
          </DataTable>
        </Section>
        <Section title={t("slow", { days: slow.days })}>
          <DataTable empty={t("empty")} numeric={[1]} head={[tc("sku"), t("available")]}>
            {slow.items.slice(0, 20).map((v) => (
              <tr key={v.variantId}>
                <Td>
                  <span className="font-mono text-xs">{v.sku}</span>
                  <div className="text-xs text-muted-foreground">{v.name}</div>
                </Td>
                <Td numeric>{fmtInt(v.available)}</Td>
              </tr>
            ))}
          </DataTable>
        </Section>
      </div>

      <Section title={t("inbound")}>
        <p className="text-xs text-muted-foreground">{t("inboundHint")}</p>
        <DataTable empty={t("empty")} numeric={[2, 3]} head={[t("shipment"), t("departed"), t("batches"), t("costs")]}>
          {inbound.map((s) => (
            <tr key={s.id}>
              <Td className="font-mono text-xs">{s.code}</Td>
              <Td>{fmtDay(s.departedAt)}</Td>
              <Td numeric>{s.batches}</Td>
              <Td numeric>{fmtInt(s.costsVnd)}</Td>
            </tr>
          ))}
        </DataTable>
      </Section>
    </Page>
  );
}
