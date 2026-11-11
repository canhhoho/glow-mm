import Image from "next/image";
import Link from "next/link";
import { ClipboardList, Download, FileText, Layers, MoreHorizontal, Package, Pencil, Plus, ShieldCheck, Store, Upload } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/auth/roles";
import { productFilterOptions } from "@/server/catalog/admin-queries";
import { listProductsPage, LIST_TABS, PAGE_SIZES, parseListTab, SELL_MODES, type ListLabel, type ListTab, type SellMode } from "@/server/catalog/product-list";
import { changeSummaries } from "@/server/catalog/review";
import { catalogStats } from "@/server/catalog/stats";
import type { ChangeItem } from "@/server/catalog/change-summary";
import { changeItemText } from "@/components/admin/change-text";
import { prisma } from "@/lib/db";
import { BulkCheckbox, BulkPublishBar, RowProductAction } from "@/components/admin/product-bulk-publish";
import { Badge, DataTable, FilterBar, FilterButton, Page, PageHeader, PageNumbers, SearchInput, StatCard, TabNav, Td, fieldClass } from "@/components/admin/ui";
import { fmtDateTime, fmtInt } from "@/lib/format";
import { localizedPath } from "@/lib/site";
import { cn } from "@/lib/utils";

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

const LABEL_TONE: Record<ListLabel, "success" | "warning" | "danger" | "neutral" | "brand"> = {
  PUBLISHED: "success",
  PENDING: "warning",
  INCOMPLETE: "danger",
  REJECTED: "danger",
  DRAFT: "neutral",
  HIDDEN: "neutral",
  ARCHIVED: "neutral",
};
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
  const tabs = LIST_TABS.filter((k) => (k !== "rejected" && k !== "archived") || tabCount[k] > 0 || k === tab);
  const from = list.total ? (list.page - 1) * list.pageSize + 1 : 0;
  const to = Math.min(list.total, list.page * list.pageSize);
  const filtered = !!(query || brandId || categoryId || warehouseId || sell);
  const price = (min: number | null, max: number | null) => (min == null ? "—" : min === max ? fmtInt(min) : `${fmtInt(min)} – ${fmtInt(max)}`);

  return (
    <Page>
      <PageHeader title={t("title")} description={t("list.subtitle")} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={<Package />} tone="brand" value={fmtInt(stats.totalProducts)} label={t("list.statTotal")} href={href({ status: undefined, page: undefined })} active={tab === "active"} testId="stat-total" />
        <StatCard icon={<Layers />} tone="green" value={fmtInt(stats.skus)} label={t("list.statSkus")} testId="stat-skus" />
        <StatCard icon={<Store />} tone="success" value={fmtInt(stats.byLabel.PUBLISHED)} label={t("tab.published")} href={href({ status: "published", page: undefined })} active={tab === "published"} />
        <StatCard icon={<ShieldCheck />} tone="warning" value={fmtInt(stats.awaitingReview)} label={t("tab.review")} href={href({ status: "review", page: undefined })} active={tab === "review"} />
        <StatCard icon={<ClipboardList />} tone="danger" value={fmtInt(stats.draftIncomplete)} label={t("tab.incomplete")} href={href({ status: "incomplete", page: undefined })} active={tab === "incomplete"} />
        <StatCard icon={<FileText />} tone="neutral" value={fmtInt(draftComplete)} label={t("tab.draft")} href={href({ status: "draft", page: undefined })} active={tab === "draft"} />
      </div>

      <TabNav
        label={t("colStatus")}
        tabs={tabs.map((k) => ({ href: href({ status: k === "active" ? undefined : k, page: undefined }), label: `${t(`tab.${k}`)} (${fmtInt(tabCount[k])})`, active: tab === k }))}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <FilterBar className="flex-1">
          {tab !== "active" && <input type="hidden" name="status" value={tab} />}
          <SearchInput label={t("search")} defaultValue={query} />
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
          <details className="relative">
            <summary className={cn(buttonVariants({ variant: "outline", size: "icon-lg" }), "list-none [&::-webkit-details-marker]:hidden")} aria-label={t("list.moreCreate")} title={t("list.moreCreate")}>
              <MoreHorizontal aria-hidden />
            </summary>
            <div className="absolute right-0 z-20 mt-1 grid w-48 rounded-lg border bg-popover p-1 text-sm shadow-md">
              <Link href="/admin/products/new?type=combo" className="rounded px-3 py-2 hover:bg-muted">{t("newCombo")}</Link>
              <Link href="/admin/categories#new-category" className="rounded px-3 py-2 hover:bg-muted">{t("newCategory")}</Link>
            </div>
          </details>
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
        className="rounded-xl bg-card"
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
          <tr key={p.id} className="hover:bg-muted/30">
            <Td className="w-8 align-middle">
              <BulkCheckbox id={p.id} label={t("selectProduct", { name: p.name })} version={p.approvalVersion} />
            </Td>
            <Td className="align-middle">
              <div className="flex min-w-56 items-center gap-3">
                <span className="relative size-11 shrink-0 overflow-hidden rounded-lg border bg-muted">
                  {p.image && <Image src={p.image.url} alt={p.image.alt || p.name} fill sizes="44px" className="object-cover" />}
                </span>
                <span className="min-w-0">
                  <Link href={`/admin/products/${p.id}`} className="line-clamp-2 font-medium hover:text-primary">
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
            </Td>
            <Td label={t("list.colStock")} className={cn("text-right tabular-nums align-middle", p.stock === 0 && "font-medium text-destructive")}>
              {p.stock == null ? "—" : fmtInt(p.stock)}
            </Td>
            <Td label={t("list.colSell")} className="align-middle">
              {!p.archived && <Badge tone={SELL_TONE[p.sell]}>{t(`sell.${p.sell}`)}</Badge>}
            </Td>
            <Td label={t("colStatus")} className="align-middle">
              <div className="flex flex-col items-start gap-1" data-testid="product-readiness" data-label={p.label}>
                <Badge tone={LABEL_TONE[p.label]}>{t(`lifecycle.${p.label}`)}</Badge>
                {p.change && <Badge tone={p.change === "REJECTED" ? "danger" : "warning"}>{t(`change.${p.change}`)}</Badge>}
                {p.label === "INCOMPLETE" && <span className="text-xs text-muted-foreground">{t("list.missing", { n: p.missing })}</span>}
              </div>
            </Td>
            <Td label={t("list.colUpdated")} className="text-xs whitespace-nowrap text-muted-foreground tabular-nums align-middle">
              {fmtDateTime(p.updatedAt)}
            </Td>
            <Td label={t("colActions")} className="align-middle">
              <div className="flex flex-nowrap items-center gap-2">
                <Link href={`/admin/products/${p.id}`} className={cn(buttonVariants({ variant: "outline", size: "icon-lg" }))} aria-label={`${t("edit")} ${p.name}`} title={t("edit")}>
                  <Pencil aria-hidden="true" />
                </Link>
                <details className="relative">
                  <summary className={cn(buttonVariants({ variant: "outline", size: "icon-lg" }), "list-none [&::-webkit-details-marker]:hidden")} aria-label={t("list.rowMenu", { name: p.name })} title={t("list.rowMenu", { name: p.name })}>
                    <MoreHorizontal aria-hidden />
                  </summary>
                  <div className="absolute right-0 z-20 mt-1 grid w-48 rounded-lg border bg-popover p-1 text-sm shadow-md">
                    {p.published && (
                      <a href={localizedPath("my", `/p/${p.slug}`)} target="_blank" rel="noreferrer" className="rounded px-3 py-2 hover:bg-muted">
                        {t("block.viewAsCustomer")}
                      </a>
                    )}
                    <Link href={`/admin/products/new?copyFrom=${p.id}`} className="rounded px-3 py-2 hover:bg-muted">{t("list.duplicate")}</Link>
                    <RowProductAction id={p.id} name={p.name} kind={p.archived ? "restore" : "delete"} menu />
                  </div>
                </details>
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
