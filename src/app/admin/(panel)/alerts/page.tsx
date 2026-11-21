import { getTranslations } from "next-intl/server";
import { LocationName } from "@/components/admin/stock-parts";
import { requirePagePermission } from "@/server/auth/session";
import { computeAlerts } from "@/server/alerts/queries";
import { Badge, DataTable, LinkButton, Page, PageHeader, TabNav, Td } from "@/components/admin/ui";
import { can } from "@/server/auth/roles";
import { MAX_RECEIVE_PICKS, receivePicksHref, type ReceivePick } from "@/lib/receive-picks";
import { fmtDay, fmtInt } from "@/lib/format";
import { FEATURES } from "@/lib/features";

const ALL_TABS = ["low", "expiry", "reorder"] as const;
type Tab = (typeof ALL_TABS)[number];
const LEVEL_TONE = { expired: "danger", unknown: "warning", blocked: "danger", near: "warning" } as const;

export default async function AlertsPage({ searchParams }: PageProps<"/admin/alerts">) {
  const user = await requirePagePermission("stock:view");
  const tabs = (FEATURES.expiry ? ALL_TABS : ["low", "reorder"]) as readonly Tab[];
  const { tab: rawTab } = await searchParams;
  const tab: Tab = tabs.includes(rawTab as Tab) ? (rawTab as Tab) : "low";
  const [t, ti, alerts] = await Promise.all([getTranslations("Alerts"), getTranslations("Inventory"), computeAlerts()]);
  const { counts, settings } = alerts;
  const tabCount: Record<Tab, number> = {
    low: counts.lowStock,
    expiry: counts.expired + counts.blocked + counts.near + counts.unknown,
    reorder: counts.reorder,
  };
  const tabLabel: Record<Tab, string> = { low: t("tabLow"), expiry: t("tabExpiry"), reorder: t("tabReorder") };
  // 20/11/2026 (audit #2): đi tiếp từ cảnh báo — phiếu nhập chọn sẵn SKU đang hiện, SL = số gợi ý đặt (nếu có).
  const canReceive = can(user.role, "stock:receive");
  const suggest = new Map(alerts.reorder.map((r) => [r.variantId, r.suggestQty]));
  // Link mang tối đa MAX_RECEIVE_PICKS SKU (độ dài URL): nút ghi đúng số được chọn; bị cắt thì ghi rõ "N SKU đầu" theo thứ tự bảng.
  const receiveButton = (all: ReceivePick[]) => {
    if (!canReceive || all.length === 0) return null;
    const picks = all.slice(0, MAX_RECEIVE_PICKS);
    return (
      <div className="flex flex-wrap items-center justify-end gap-2" data-testid="alerts-receive">
        {all.length > picks.length && <span className="text-xs text-muted-foreground">{t("createReceiptCapped", { count: picks.length, total: all.length })}</span>}
        <LinkButton href={receivePicksHref(picks)} variant="primary" icon="new">
          {t("createReceipt", { count: picks.length })}
        </LinkButton>
      </div>
    );
  };
  // Chuẩn bảng SP: tên là dòng chính, SKU dòng phụ (xuống dòng khi dài).
  const product = (sku: string, name: string) => (
    <>
      <span className="block font-medium break-words">{name}</span>
      <span className="block font-mono text-xs break-all text-muted-foreground">{sku}</span>
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
        tabs={tabs.map((k) => ({
          href: `/admin/alerts?tab=${k}`,
          active: k === tab,
          label: tabLabel[k],
          count: tabCount[k],
          tone: tabCount[k] > 0 ? "danger" : "neutral",
        }))}
      />

      {tab === "low" && receiveButton(alerts.lowStock.map((v) => ({ id: v.variantId, qty: suggest.get(v.variantId) })))}
      {tab === "low" && (
        <DataTable stack empty={t("empty")} numeric={[1, 2, 3]} head={[t("product"), t("available"), t("threshold"), t("other")]}>
          {alerts.lowStock.map((v) => (
            <tr key={v.variantId} data-testid="alert-row">
              <Td>{product(v.sku, v.name)}</Td>
              <Td label={t("available")} numeric className="font-medium">{fmtInt(v.available)}</Td>
              <Td label={t("threshold")} numeric>{fmtInt(v.lowStockAt)}</Td>
              <Td label={t("other")} numeric className="text-muted-foreground">{v.otherQty > 0 ? fmtInt(v.otherQty) : "—"}</Td>
            </tr>
          ))}
        </DataTable>
      )}

      {tab === "expiry" && (
        <DataTable
          stack
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
              <Td label={t("lot")} className="font-mono text-xs">{e.lotNo}</Td>
              <Td label={t("expiry")} className="whitespace-nowrap">{fmtDay(e.expiryDate)}</Td>
              <Td label={t("location")}>
                <LocationName loc={{ code: e.location, name: e.locationName, active: e.locationActive }} inactiveLabel={ti("inactive")} />
              </Td>
              <Td label={ti("stockTypeFilter")}>{ti(e.stockType)}</Td>
              <Td label={t("qty")} numeric>{fmtInt(e.qty)}</Td>
            </tr>
          ))}
        </DataTable>
      )}

      {tab === "reorder" && (
        <>
          {receiveButton(alerts.reorder.map((r) => ({ id: r.variantId, qty: r.suggestQty })))}
          <p className="text-xs text-muted-foreground">{t("reorderHint")}</p>
          <DataTable
            stack
            empty={t("empty")}
            numeric={[1, 2, 3, 4, 5, 6]}
            head={[
              t("product"),
              t("dailySales"),
              t("available"),
              t("other"),
              t("coverDays"),
              t("leadTime"),
              t("suggest"),
            ]}
          >
            {alerts.reorder.map((r) => (
              <tr key={r.variantId} data-testid="alert-row">
                <Td>{product(r.sku, r.name)}</Td>
                <Td label={t("dailySales")} numeric>{r.dailySales}</Td>
                <Td label={t("available")} numeric>{fmtInt(r.available)}</Td>
                <Td label={t("other")} numeric className="text-muted-foreground">{r.otherQty > 0 ? fmtInt(r.otherQty) : "—"}</Td>
                <Td label={t("coverDays")} numeric>{r.coverDaysLeft ?? "—"}</Td>
                <Td label={t("leadTime")} numeric>{r.leadTimeDays}</Td>
                <Td label={t("suggest")} numeric className="font-medium">{fmtInt(r.suggestQty)}</Td>
              </tr>
            ))}
          </DataTable>
        </>
      )}
    </Page>
  );
}
