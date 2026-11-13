import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { computeAlerts } from "@/server/alerts/queries";
import { Badge, DataTable, Page, PageHeader, TabNav, Td } from "@/components/admin/ui";
import { fmtDay, fmtInt } from "@/lib/format";

const TABS = ["low", "expiry", "reorder"] as const;
type Tab = (typeof TABS)[number];
const LEVEL_TONE = { expired: "danger", unknown: "warning", blocked: "danger", near: "warning" } as const;

export default async function AlertsPage({ searchParams }: PageProps<"/admin/alerts">) {
  await requirePagePermission("stock:view");
  const { tab: rawTab } = await searchParams;
  const tab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : "low";
  const [t, ti, alerts] = await Promise.all([getTranslations("Alerts"), getTranslations("Inventory"), computeAlerts()]);
  const { counts, settings } = alerts;
  const tabCount: Record<Tab, number> = {
    low: counts.lowStock,
    expiry: counts.expired + counts.blocked + counts.near + counts.unknown,
    reorder: counts.reorder,
  };
  const tabLabel: Record<Tab, string> = { low: t("tabLow"), expiry: t("tabExpiry"), reorder: t("tabReorder") };
  const product = (sku: string, name: string) => (
    <>
      <span className="font-mono text-xs">{sku}</span> {name}
    </>
  );

  return (
    <Page>
      <PageHeader
        title={t("title")}
        description={t("note", {
          block: settings.blockDays,
          warn: settings.warnDays,
          window: settings.salesWindowDays,
          cover: settings.coverDays,
        })}
      />
      <TabNav
        label={t("title")}
        tabs={TABS.map((k) => ({
          href: `/admin/alerts?tab=${k}`,
          active: k === tab,
          label: tabLabel[k],
          count: tabCount[k],
          tone: tabCount[k] > 0 ? "danger" : "neutral",
        }))}
      />

      {tab === "low" && (
        <DataTable empty={t("empty")} numeric={[1, 2, 3, 4]} head={[t("product"), t("available"), t("threshold"), t("vn"), t("inbound")]}>
          {alerts.lowStock.map((v) => (
            <tr key={v.variantId} data-testid="alert-row">
              <Td>{product(v.sku, v.name)}</Td>
              <Td className="text-right font-medium tabular-nums">{fmtInt(v.available)}</Td>
              <Td className="text-right tabular-nums">{fmtInt(v.lowStockAt)}</Td>
              <Td className="text-right tabular-nums">{fmtInt(v.vnQty)}</Td>
              <Td className="text-right tabular-nums">{fmtInt(v.inboundQty)}</Td>
            </tr>
          ))}
        </DataTable>
      )}

      {tab === "expiry" && (
        <DataTable
          empty={t("empty")}
          numeric={[6]}
          head={[t("level"), t("product"), t("lot"), t("expiry"), t("location"), <span key="st" className="sr-only">{ti("stockTypeFilter")}</span>, t("qty")]}
        >
          {alerts.expiry.map((e) => (
            <tr key={`${e.batchId}|${e.location}|${e.stockType}`} data-testid="alert-row">
              <Td>
                <Badge tone={LEVEL_TONE[e.level]}>{t(`lv.${e.level}`)}</Badge>
              </Td>
              <Td>{product(e.sku, e.name)}</Td>
              <Td className="font-mono text-xs">{e.lotNo}</Td>
              <Td className="whitespace-nowrap">{fmtDay(e.expiryDate)}</Td>
              <Td className="font-mono text-xs">{e.location}</Td>
              <Td>{ti(e.stockType)}</Td>
              <Td className="text-right tabular-nums">{fmtInt(e.qty)}</Td>
            </tr>
          ))}
        </DataTable>
      )}

      {tab === "reorder" && (
        <>
          <p className="text-xs text-muted-foreground">{t("reorderHint")}</p>
          <DataTable
            empty={t("empty")}
            numeric={[1, 2, 3, 4, 5, 6, 7]}
            head={[
              t("product"),
              t("dailySales"),
              t("available"),
              t("vn"),
              t("inbound"),
              t("coverDays"),
              t("leadTime"),
              t("suggest"),
            ]}
          >
            {alerts.reorder.map((r) => (
              <tr key={r.variantId} data-testid="alert-row">
                <Td>{product(r.sku, r.name)}</Td>
                <Td className="text-right tabular-nums">{r.dailySales}</Td>
                <Td className="text-right tabular-nums">{fmtInt(r.available)}</Td>
                <Td className="text-right tabular-nums">{fmtInt(r.vnQty)}</Td>
                <Td className="text-right tabular-nums">{fmtInt(r.inboundQty)}</Td>
                <Td className="text-right tabular-nums">{r.coverDaysLeft ?? "—"}</Td>
                <Td className="text-right tabular-nums">{r.leadTimeDays}</Td>
                <Td className="text-right font-medium tabular-nums">{fmtInt(r.suggestQty)}</Td>
              </tr>
            ))}
          </DataTable>
        </>
      )}
    </Page>
  );
}
