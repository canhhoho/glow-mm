import Image from "next/image";
import Link from "next/link";
import { Archive, Download, Layers, MoreHorizontal, Package, Pencil, Plus, TriangleAlert, Upload } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/auth/roles";
import { productFilterOptions } from "@/server/catalog/admin-queries";
import { listProductsPage, MAIN_LIST_TABS, OTHER_LIST_TABS, PAGE_SIZES, parseListTab, SELL_MODES, type ListTab, type SellMode } from "@/server/catalog/product-list";
import { changeSummaries } from "@/server/catalog/review";
import { catalogStats } from "@/server/catalog/stats";
import type { ChangeItem } from "@/server/catalog/change-summary";
import { changeItemText } from "@/components/admin/change-text";
import { prisma } from "@/lib/db";
import { BulkCheckbox, BulkPublishBar, RowProductAction } from "@/components/admin/product-bulk-publish";
import { ActionMenu } from "@/components/admin/action-menu";
import { Badge, DataTable, FilterBar, FilterButton, MENU_ITEM, Page, PageHeader, PageNumbers, SearchInput, StatCard, TabNav, Td, fieldClass } from "@/components/admin/ui";
import { fmtDateTime, fmtInt } from "@/lib/format";
import { localizedPath } from "@/lib/site";
import { cn } from "@/lib/utils";
import { PRODUCT_LABEL_TONE, changeTone } from "@/components/admin/status-tones";

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

const SELL_TONE: Record<SellMode, "success" | "brand" | "danger"> = { instock: "success", preorder: "brand", out: "danger" };

/**
 * Danh sách sản phẩm (P3 — thiết kế "Sản phẩm"): ô số → tab trạng thái → bộ lọc + Nhập/Xuất Excel + Thêm SP →
 * bảng (ảnh, SKU, giá, tồn bán được, điều kiện bán, trạng thái, cập nhật) → phân trang. Thao tác hàng loạt giữ nguyên.
 */
export default async function ProductsPage({ searchParams }: PageProps<"/admin/products">) {
  const user = await requirePagePermission("catalog:manage");
  const sp = await searchParams;
  const query = str(sp.q);
  const brandId = str(sp.brand);
  const categoryId = str(sp.category);
  const warehouseId = str(sp.warehouse);
  const tab = parseListTab(sp.status);
  const sell = SELL_MODES.find((s) => s === sp.sell);
  const page = Number(str(sp.page)) || 1;
  const pageSize = Number(str(sp.size)) || undefined;
  const [t, tc, list, options, stats] = await Promise.all([
    getTranslations("Products"),
    getTranslations("Common"),
    listProductsPage({ tab, q: query, brandId, categoryId, warehouseId, sell, page, pageSize }),
    productFilterOptions(),
    catalogStats(),
  ]);
  const products = list.rows;
  const archivedView = tab === "archived";
  // Hàng đợi "Chờ duyệt": cột Thay đổi (SP đã duyệt có bản đang sửa) để duyệt hàng loạt đúng nội dung đang xem.
  const reviewQueue = tab === "review";
  const changes = reviewQueue ? await changeSummaries(prisma, products.filter((p) => p.hasChanges).map((p) => p.id)) : new Map<string, ChangeItem[]>();
  const changeText = (c: ChangeItem) => changeItemText(t as Parameters<typeof changeItemText>[0], c);

  const params = { q: query, brand: brandId, category: categoryId, warehouse: warehouseId, sell };
  const href = (over: Record<string, string | number | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, status: tab === "active" ? undefined : tab, size: list.pageSize === PAGE_SIZES[0] ? undefined : list.pageSize, ...over })) {
      if (v !== undefined && v !== "" && !(k === "page" && String(v) === "1")) qs.set(k, String(v));
    }
    const s = qs.toString();
    return `/admin/products${s ? `?${s}` : ""}`;
  };
  const draftComplete = Math.max(0, stats.byLabel.DRAFT - stats.draftIncomplete);
  const tabCount: Record<ListTab, number> = {
    active: stats.totalProducts,
    published: stats.byLabel.PUBLISHED,
    review: stats.awaitingReview,
    incomplete: stats.draftIncomplete,
    draft: draftComplete,
    hidden: stats.byLabel.HIDDEN,
    outOfStock: stats.published.outOfStock,
    rejected: stats.rejected,
    archived: stats.byLabel.ARCHIVED,
  };
  // Tab chính = hàng đợi công việc; "Ngừng kinh doanh" chỉ hiện khi có SP; trạng thái phụ nằm trong ô chọn.
  const tabs = MAIN_LIST_TABS.filter((k) => k !== "archived" || tabCount[k] > 0 || k === tab);
  const otherTabs = OTHER_LIST_TABS.filter((k) => k !== "rejected" || tabCount[k] > 0 || k === tab);
  const mainTab = tab !== "active" && (MAIN_LIST_TABS as readonly string[]).includes(tab);
  // Mở chi tiết kèm `from` = danh sách hiện tại (tab, bộ lọc, trang) để nút Quay lại về đúng chỗ.
  const listHref = href({ page: list.page });
  const detailHref = (id: string) => `/admin/products/${id}?from=${encodeURIComponent(listHref)}`;
  const from = list.total ? (list.page - 1) * list.pageSize + 1 : 0;
  const to = Math.min(list.total, list.page * list.pageSize);
  const filtered = !!(query || brandId || categoryId || warehouseId || sell);
  const price = (min: number | null, max: number | null) => (min == null ? "—" : min === max ? fmtInt(min) : `${fmtInt(min)} – ${fmtInt(max)}`);

  return (
    <Page>
      <PageHeader title={t("title")} description={t("list.subtitle")} />

      {/* Ô số khác với tab: tổng (ghi rõ không gồm ngừng kinh doanh), SKU, hàng đang bán đã hết, và số SP ngừng kinh doanh. */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon={<Package />} tone="brand" value={fmtInt(stats.totalProducts)} label={t("list.statTotal")} href={href({ status: undefined, page: undefined })} active={tab === "active"} testId="stat-total" />
        <StatCard icon={<Layers />} tone="green" value={fmtInt(stats.skus)} label={t("list.statSkus")} testId="stat-skus" />
        <StatCard icon={<TriangleAlert />} tone="warning" value={fmtInt(stats.published.outOfStock)} label={t("tab.outOfStock")} href={href({ status: "outOfStock", page: undefined })} active={tab === "outOfStock"} testId="stat-out-of-stock" />
        <StatCard icon={<Archive />} tone="neutral" value={fmtInt(stats.byLabel.ARCHIVED)} label={t("tab.archived")} href={href({ status: "archived", page: undefined })} active={tab === "archived"} testId="stat-archived" />
      </div>

      <TabNav
        label={t("colStatus")}
        tabs={tabs.map((k) => ({ href: href({ status: k === "active" ? undefined : k, page: undefined }), label: `${t(`tab.${k}`)} (${fmtInt(tabCount[k])})`, active: tab === k }))}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <FilterBar className="flex-1">
          {mainTab ? (
            <input type="hidden" name="status" value={tab} />
          ) : (
            <select name="status" defaultValue={tab === "active" ? "" : tab} aria-label={t("otherStatuses")} className={fieldClass}>
              <option value="">{t("otherStatuses")}</option>
              {otherTabs.map((k) => (
                <option key={k} value={k}>
                  {t(`tab.${k}`)} ({fmtInt(tabCount[k])})
                </option>
              ))}
            </select>
          )}
          <SearchInput label={t("search")} defaultValue={query} />
          {/* Bộ lọc nâng cao thu gọn (vẫn nằm trong form nên gửi cùng nút Lọc); tự mở khi đang lọc. */}
          <details className="group/adv w-full md:w-auto" open={!!(categoryId || brandId || warehouseId || sell)}>
            <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              {t("advancedFilters")}
            </summary>
            <div className="mt-2 flex flex-wrap gap-2">
              <select name="category" defaultValue={categoryId ?? ""} aria-label={t("colCategory")} className={fieldClass}>
                <option value="">{t("allCategories")}</option>
                {options.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.depth ? `— ${c.name}` : c.name}
                  </option>
                ))}
              </select>
              <select name="brand" defaultValue={brandId ?? ""} aria-label={t("colBrand")} className={fieldClass}>
                <option value="">{t("allBrands")}</option>
                {options.brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              {options.warehouses.length > 1 && (
                <select name="warehouse" defaultValue={warehouseId ?? ""} aria-label={t("warehouse")} className={fieldClass}>
                  <option value="">{t("allWarehouses")}</option>
                  {options.warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              )}
              <select name="sell" defaultValue={sell ?? ""} aria-label={t("list.colSell")} className={fieldClass}>
                <option value="">{t("sell.all")}</option>
                {SELL_MODES.map((s) => (
                  <option key={s} value={s}>
                    {t(`sell.${s}`)}
                  </option>
                ))}
              </select>
            </div>
          </details>
          <FilterButton>{tc("filter")}</FilterButton>
          {filtered && (
            <Link href={href({ q: undefined, brand: undefined, category: undefined, warehouse: undefined, sell: undefined, page: undefined })} className="self-center text-sm text-primary underline">
              {t("clearFilters")}
            </Link>
          )}
        </FilterBar>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/products/import" className={buttonVariants({ variant: "outline", size: "lg" })}>
            <Upload aria-hidden /> {t("list.importExcel")}
          </Link>
          <a href="/api/templates/catalog-current.xlsx" className={buttonVariants({ variant: "outline", size: "lg" })}>
            <Download aria-hidden /> {t("list.exportExcel")}
          </a>
          <Link href="/admin/products/new" className={buttonVariants({ size: "lg" })}>
            <Plus aria-hidden /> {t("new")}
          </Link>
          <ActionMenu trigger={<MoreHorizontal aria-hidden />} triggerClassName={buttonVariants({ variant: "outline", size: "icon-lg" })} label={t("list.moreCreate")}>
            <Link href="/admin/products/new?type=combo" className={MENU_ITEM}>{t("newCombo")}</Link>
            <Link href="/admin/categories#new-category" className={MENU_ITEM}>{t("newCategory")}</Link>
          </ActionMenu>
        </div>
      </div>

      <BulkPublishBar
        total={products.length}
        archivedView={archivedView}
        warehouses={options.warehouses}
        can={{ publish: can(user.role, "catalog:publish"), approve: can(user.role, "catalog:approve") }}
        reviewQueue={reviewQueue}
      />
      <DataTable
        stack
        empty={t("empty")}
        numeric={[4, 5]}
        head={[
          <span key="sel" className="sr-only">{t("colSelect")}</span>,
          t("list.colProduct"),
          t("list.colSku"),
          t("colCategory"),
          t("list.colPrice"),
          t("list.colStock"),
          t("list.colSell"),
          t("colStatus"),
          t("list.colUpdated"),
          t("colActions"),
        ]}
      >
        {products.map((p) => (
          <tr key={p.id}>
            <Td className="w-8 align-middle">
              <BulkCheckbox id={p.id} label={t("selectProduct", { name: p.name })} version={p.approvalVersion} />
            </Td>
            <Td className="align-middle">
              <div className="flex min-w-56 items-center gap-3">
                <span className="relative size-11 shrink-0 overflow-hidden rounded-lg border bg-muted">
                  {p.image && <Image src={p.image.url} alt={p.image.alt || p.name} fill sizes="44px" className="object-cover" />}
                </span>
                <span className="min-w-0">
                  <Link href={detailHref(p.id)} className="line-clamp-2 font-medium hover:text-primary">
                    {p.name}
                  </Link>
                  <span className="block text-xs text-muted-foreground">{p.brand}</span>
                  <span className="sr-only">{p.slug}</span>
                  {reviewQueue && (
                    <span className="mt-1 block text-xs" data-testid="queue-changes">
                      {p.approvedAt ? (changes.get(p.id) ?? []).map(changeText).join(" · ") || "—" : t("bulkReview.newProduct")}
                    </span>
                  )}
                </span>
              </div>
            </Td>
            <Td label={t("list.colSku")} className="align-middle">
              <span className="font-mono text-xs">{p.variants[0]?.sku ?? "—"}</span>
              {p.variants.length > 1 && <span className="block text-xs text-muted-foreground">{t("list.moreVariants", { n: p.variants.length - 1 })}</span>}
              {p.variants.length === 1 && p.variants[0].isBundle && <Badge tone="brand">combo</Badge>}
            </Td>
            <Td label={t("colCategory")} className="align-middle">
              {p.category}
              <span className="block text-xs text-muted-foreground">{p.warehouse}</span>
            </Td>
            <Td label={t("list.colPrice")} className="text-right whitespace-nowrap tabular-nums align-middle">
              {price(p.priceMin, p.priceMax)}
              {p.pendingMin != null && (
                <div className="text-xs whitespace-nowrap text-warning-foreground" data-testid="list-price-pending">
                  {t("list.pricePending", { price: price(p.pendingMin, p.pendingMax) })}
                </div>
              )}
            </Td>
            <Td label={t("list.colStock")} className={cn("text-right tabular-nums align-middle", p.stock === 0 && "font-medium text-destructive")}>
              {p.stock == null ? "—" : fmtInt(p.stock)}
            </Td>
            <Td label={t("list.colSell")} className="align-middle">
              {!p.archived && <Badge tone={SELL_TONE[p.sell]}>{t(`sell.${p.sell}`)}</Badge>}
            </Td>
            <Td label={t("colStatus")} className="align-middle">
              <div className="flex flex-col items-start gap-1" data-testid="product-readiness" data-label={p.label}>
                <Badge tone={PRODUCT_LABEL_TONE[p.label]}>{t(`lifecycle.${p.label}`)}</Badge>
                {p.change && <Badge tone={changeTone(p.change)}>{t(`change.${p.change}`)}</Badge>}
                {p.label === "INCOMPLETE" && <span className="text-xs text-muted-foreground">{t("list.missing", { n: p.missing })}</span>}
              </div>
            </Td>
            <Td label={t("list.colUpdated")} className="text-xs whitespace-nowrap text-muted-foreground tabular-nums align-middle">
              {fmtDateTime(p.updatedAt)}
            </Td>
            <Td label={t("colActions")} className="align-middle">
              <div className="flex flex-nowrap items-center gap-2">
                <Link href={detailHref(p.id)} className={cn(buttonVariants({ variant: "outline", size: "icon-lg" }))} aria-label={`${t("edit")} ${p.name}`} title={t("edit")}>
                  <Pencil aria-hidden="true" />
                </Link>
                <ActionMenu trigger={<MoreHorizontal aria-hidden />} triggerClassName={buttonVariants({ variant: "outline", size: "icon-lg" })} label={t("list.rowMenu", { name: p.name })}>
                  {p.published && (
                    <a href={localizedPath("my", `/p/${p.slug}`)} target="_blank" rel="noreferrer" className={MENU_ITEM}>
                      {t("block.viewAsCustomer")}
                    </a>
                  )}
                  <Link href={`/admin/products/new?copyFrom=${p.id}`} className={MENU_ITEM}>{t("list.duplicate")}</Link>
                  <RowProductAction id={p.id} name={p.name} kind={p.archived ? "restore" : "delete"} menu />
                </ActionMenu>
              </div>
            </Td>
          </tr>
        ))}
      </DataTable>
      <PageNumbers
        page={list.page}
        pageCount={list.pageCount}
        pageSize={list.pageSize}
        pageSizes={PAGE_SIZES}
        status={t("list.showing", { from, to, total: list.total })}
        sizeLabel={t("list.pageSize")}
        prevLabel={t("list.prev")}
        nextLabel={t("list.next")}
        href={(pg, size) => href({ page: pg, ...(size && { size: size === PAGE_SIZES[0] ? undefined : size }) })}
      />
    </Page>
  );
}
