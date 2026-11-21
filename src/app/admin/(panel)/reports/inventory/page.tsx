import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import Link from "next/link";
import { inboundShipments, stockByLocation } from "@/server/reports/queries";
import { DataTable, Notice, Page, PageHeader, Section, Td } from "@/components/admin/ui";
import { ReportsTabs } from "@/components/admin/reports-tabs";
import { fmtDay, fmtInt } from "@/lib/format";
import { FEATURES } from "@/lib/features";

/**
 * Báo cáo tồn kho: số liệu TỒN HIỆN TẠI (không theo kỳ) — tồn theo kho, chuyến hàng đang về (bán chậm: Cảnh báo › Bán chậm).
 * Các khối dời nguyên từ báo cáo Bán hàng; dùng cùng hàm `reports/queries.ts`, không thêm công thức mới.
 */
export default async function InventoryReportPage() {
  await requirePagePermission("reports:view");
  const [t, tn, inbound, stock] = await Promise.all([
    getTranslations("Reports"),
    getTranslations("Nav"),
    // Chuyến hàng đang tắt (`lib/features.ts`): không tải / không hiện khối "chuyến hàng đang về".
    FEATURES.shipments ? inboundShipments() : Promise.resolve([]),
    stockByLocation(),
  ]);

  return (
    <Page>
      <PageHeader title={tn("inventoryReports")} description={t("inventoryBasis")} />
      <ReportsTabs active="inventory" />
      <Notice>{t("inventoryNow")}</Notice>
      {/* 20/11/2026: hai khối xếp dọc, mỗi khối rộng hết vùng nội dung (trước: hai cột trên lg → bảng tồn bị bó, phải cuộn ngang).
          Bảng tồn: table-fixed + colgroup chia cột (kho rộng hơn, cột số đều nhau), tiêu đề dài xuống dòng; điện thoại giữ
          độ rộng tối thiểu → cuộn trong bảng (DataTable đã overflow-x-auto). */}
      <Section title={t("stock")}>
        <DataTable
          empty={t("empty")}
          tableClassName="min-w-[40rem] table-fixed"
          cols={["w-[22%]", "w-[17%]", "w-[11%]", "w-[18%]", "w-[16%]", "w-[16%]"]}
          numeric={[1, 2, 3, 4, 5]}
          head={[t("locType"), t("qty"), t("tester"), t("value"), t("estimatedQty"), t("noCost")].map((h, i) => (i === 0 ? h : <span key={i} className="whitespace-normal">{h}</span>))}
        >
          {stock.map((s) => (
            <tr key={s.code ?? "inactive"} data-testid={`stock-${s.code ?? "inactive"}`}>
              <Td className="break-words">{s.name ?? t("inactiveLocations")}</Td>
              <Td numeric>{fmtInt(s.qty)}</Td>
              <Td numeric>{fmtInt(s.testerQty)}</Td>
              <Td numeric>{fmtInt(s.valueMmk)}</Td>
              <Td numeric>{s.estimatedQty ? fmtInt(s.estimatedQty) : "—"}</Td>
              <Td numeric>{s.missingCost ? fmtInt(s.missingCost) : "—"}</Td>
            </tr>
          ))}
        </DataTable>
      </Section>
      {/* 21/11/2026 (audit #19): "Bán chậm" dời sang Cảnh báo (tab Bán chậm) — để lại lối tắt. */}
      <p className="text-sm text-muted-foreground">
        {t("slowMoved")}{" "}
        <Link href="/admin/alerts?tab=slow" className="text-primary underline">
          {t("slowMovedLink")}
        </Link>
      </p>

      {FEATURES.shipments && (
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
      )}
    </Page>
  );
}
