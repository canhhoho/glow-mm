import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/auth/roles";
import { affiliateOptions } from "@/server/affiliates/affiliates";
import { listOrdersPageAdmin, sellableLocations } from "@/server/orders/admin-queries";
import { pageNumber } from "@/lib/pagination";
import { datePresetItems, optionalRange, presetLabels } from "@/lib/date-range";
import { ORDER_FILTER_STATUSES, PREPARING_STATUSES, TRANSITIONS } from "@/server/orders/state-machine";
import { BULK_TRANSITIONS } from "@/server/orders/bulk";
import { BulkOrderBar } from "@/components/admin/bulk-order-bar";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/admin/order-badges";
import { ORDER_TAB_STATUSES, OrdersTabs, type OrdersTab } from "@/components/admin/orders-tabs";
import { AdvancedFilters, Badge, checkboxClass, ClearFilters, DataTable, DateRangeFields, fieldClass, fieldLabelClass, FilterBar, FilterButton, LinkButton, Page, PageHeader, PageNumbers, SearchInput, Td } from "@/components/admin/ui";
import { fmtDate, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

const CHANNELS = ["WEB", "FACEBOOK", "VIBER", "PHONE"] as const;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function OrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  const user = await requirePagePermission("orders:view");
  const sp = await searchParams;
  const filter = {
    status: PREPARING_STATUSES.some((s) => s === str(sp.status)) ? "PREPARING" : str(sp.status),
    paymentMethod: str(sp.paymentMethod),
    channel: str(sp.channel),
    q: str(sp.q),
    overdue: sp.overdue === "1",
    affiliateId: str(sp.affiliate),
    ...optionalRange(sp), locationId: str(sp.locationId), page: pageNumber(sp.page), shippingDays: Number(sp.shippingDays) || undefined,
  };
  const [t, tc, tcod, result, affiliates, locations] = await Promise.all([getTranslations("Orders"), getTranslations("Common"), getTranslations("Cod"), listOrdersPageAdmin(filter), affiliateOptions(), sellableLocations()]);
  const orders = result.orders;
  const pageHref = (page: number) => { const params = new URLSearchParams(); for (const [key,value] of Object.entries(sp)) { if (key !== "page") for (const v of Array.isArray(value) ? value : value ? [value] : []) params.append(key,v); } params.set("page",String(page)); return `/admin/orders?${params}`; };
  const tabStatus = ORDER_TAB_STATUSES.find((s) => s === filter.status);
  const activeTab: OrdersTab | null = tabStatus ?? (filter.status ? null : "all");
  const filtered = !!(filter.status || filter.paymentMethod || filter.channel || filter.q || filter.overdue || filter.affiliateId || filter.from || filter.to || filter.locationId || filter.shippingDays);

  return (
    <Page>
      <PageHeader
        title={t("title")}
        actions={
          <>
          {can(user.role, "orders:reconcile-cod") && <LinkButton href="/admin/orders/cod">{tcod("title")}</LinkButton>}
          {can(user.role, "orders:ship") && <LinkButton href="/admin/orders/export">{t("exportVtp")}</LinkButton>}
          {can(user.role, "orders:create") && (
            <LinkButton href="/admin/orders/new" variant="primary" icon="new">
              {t("new")}
            </LinkButton>
          )}
          </>
        }
      />
      <OrdersTabs active={activeTab} />
      <FilterBar>
        <DateRangeFields
          from={filter.from}
          to={filter.to}
          fromLabel={t("fromDate")}
          toLabel={t("toDate")}
          presetsLabel={tc("datePresets")}
          presets={datePresetItems(presetLabels(tc), (r) => { const params = new URLSearchParams(); for (const [key, value] of Object.entries(sp)) { if (key !== "page" && key !== "from" && key !== "to") for (const v of Array.isArray(value) ? value : value ? [value] : []) params.append(key, v); } params.set("from", r.from); params.set("to", r.to); return `/admin/orders?${params}`; }, filter)}
        />
        <SearchInput label={t("search")} defaultValue={filter.q} />
        {/* Trạng thái chính nằm ở tab (giữ qua nút Lọc bằng ô ẩn); ô chọn: Mọi trạng thái (mặc định) / Đã huỷ / Trả hàng. */}
        {tabStatus ? (
          <input type="hidden" name="status" value={tabStatus} />
        ) : (
          <select name="status" defaultValue={filter.status ?? ""} aria-label={t("colStatus")} className={cn(fieldClass, "w-auto")}>
            <option value="">{t("allStatuses")}</option>
            {ORDER_FILTER_STATUSES.filter((s) => s === "CANCELLED" || s === "RETURNED").map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </select>
        )}
        {/* 20/11/2026 (audit): lọc phụ thu gọn như danh sách SP; tự mở khi đang dùng. */}
        <AdvancedFilters label={t("advancedFilters")} open={!!(filter.locationId || filter.shippingDays || filter.paymentMethod || filter.channel || filter.affiliateId || filter.overdue)}>
          <select name="paymentMethod" defaultValue={filter.paymentMethod ?? ""} aria-label={t("paymentMethod")} className={cn(fieldClass, "w-auto")}>
            <option value="">{t("allPaymentMethods")}</option>
            <option value="COD">{t("method.COD")}</option>
            <option value="BANK_TRANSFER">{t("method.BANK_TRANSFER")}</option>
          </select>
          <select name="channel" defaultValue={filter.channel ?? ""} aria-label={t("colChannel")} className={cn(fieldClass, "w-auto")}>
            <option value="">{t("allChannels")}</option>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {t(`channel.${c}`)}
              </option>
            ))}
          </select>
          <select name="locationId" defaultValue={filter.locationId ?? ""} aria-label={t("warehouse")} className={cn(fieldClass,"w-auto")}><option value="">{t("allWarehouses")}</option>{locations.map(l=><option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}</select>
          {affiliates.length > 0 && (
            <select name="affiliate" defaultValue={filter.affiliateId ?? ""} aria-label={t("colAffiliate")} className={cn(fieldClass, "w-auto")}>
              <option value="">{t("allAffiliates")}</option>
              {affiliates.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          )}
          <label className={fieldLabelClass}><span>{t("shippingDays")}</span><input type="number" name="shippingDays" min={1} max={365} defaultValue={filter.shippingDays} className={cn(fieldClass,"w-28")} /></label>
          <label className="flex h-9 items-center gap-1.5 text-sm">
            <input type="checkbox" name="overdue" value="1" defaultChecked={filter.overdue} className={checkboxClass} />
            {t("overdueOnly")}
          </label>
        </AdvancedFilters>
        <FilterButton>{tc("filter")}</FilterButton>
        {filtered && <ClearFilters href="/admin/orders">{t("clearFilters")}</ClearFilters>}
      </FilterBar>

      {orders.length > 0 && (
        <BulkOrderBar key={JSON.stringify({ ...filter, page: result.page })} transitions={BULK_TRANSITIONS.filter((n) => can(user.role, TRANSITIONS[n].permission))} />
      )}
      <DataTable
        empty={filtered ? t("emptyFiltered") : t("empty")}
        head={[<span key="sel" className="sr-only">{tc("select")}</span>, t("colCode"), t("colCreated"), t("colCustomer"), t("colChannel"), t("colPayment"), t("colTotal"), t("colStatus")]}
        numeric={[6]}
        stack
      >
        {orders.map((o) => (
          <tr key={o.id}>
            <Td className="w-8">
              <input type="checkbox" data-bulk-id={o.id} aria-label={t("bulk.select", { code: o.code })} className={checkboxClass} />
            </Td>
            <Td>
              <Link href={`/admin/orders/${o.id}?from=${encodeURIComponent(pageHref(result.page))}`} className="font-mono text-xs whitespace-nowrap text-primary underline">
                {o.code}
              </Link>
              <div className="text-xs text-muted-foreground">
                {o._count.items} {t("colItems")}
              </div>
            </Td>
            <Td label={t("colCreated")} className="whitespace-nowrap">
              {fmtDate(o.createdAt)}
            </Td>
            <Td label={t("colCustomer")}>
              {o.recipientName}
              <div className="font-mono text-xs text-muted-foreground">{o.recipientPhone}</div>
            </Td>
            <Td label={t("colChannel")}>
              {t(`channel.${o.channel}`)}
              {o.affiliate && (
                <div className="font-mono text-xs text-muted-foreground" title={t("colAffiliate")}>
                  {t("colAffiliate")}: {o.affiliate.code}
                </div>
              )}
            </Td>
            <Td label={t("colPayment")}>
              <div className="flex flex-col items-start gap-1">
                <span className="text-xs">{t(`method.${o.paymentMethod}`)}</span>
                <PaymentStatusBadge status={o.paymentStatus} />
              </div>
            </Td>
            <Td label={t("colTotal")} className="text-right tabular-nums whitespace-nowrap">
              {fmtInt(o.totalMmk)} MMK
            </Td>
            <Td label={t("colStatus")}>
              <div className="flex flex-col items-start gap-1">
                <OrderStatusBadge status={o.status} />
                {o.overdue && <Badge tone="danger">{t("overdue")}</Badge>}
              </div>
            </Td>
          </tr>
        ))}
      </DataTable>
      {result.total > 0 && (
        <PageNumbers
          page={result.page}
          pageCount={result.pages}
          pageSize={orders.length}
          status={t("pageCount", { page: result.page, pages: result.pages, total: result.total })}
          prevLabel={t("previousPage")}
          nextLabel={t("nextPage")}
          href={(pg) => pageHref(pg)}
        />
      )}
    </Page>
  );
}
