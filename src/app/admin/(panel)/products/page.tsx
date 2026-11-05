import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { listProductsAdmin, PRODUCT_STATUSES, productFilterOptions, type ProductStatusFilter } from "@/server/catalog/admin-queries";
import { BrandForm } from "@/components/admin/catalog-forms";
import { BulkCheckbox, BulkPublishBar, RowProductAction } from "@/components/admin/product-bulk-publish";
import { Badge, DataTable, FilterBar, FilterButton, LinkButton, Page, PageHeader, SearchInput, Section, Td, fieldClass } from "@/components/admin/ui";
import { fmtInt } from "@/lib/format";

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

export default async function ProductsPage({ searchParams }: PageProps<"/admin/products">) {
  await requirePagePermission("catalog:manage");
  const sp = await searchParams;
  const query = str(sp.q);
  const brandId = str(sp.brand);
  const categoryId = str(sp.category);
  const warehouseId = str(sp.warehouse);
  const status: ProductStatusFilter = PRODUCT_STATUSES.find((s) => s === sp.status) ?? "active";
  const [t, tn, tc, products, options] = await Promise.all([
    getTranslations("Products"),
    getTranslations("Nav"),
    getTranslations("Common"),
    listProductsAdmin({ q: query, brandId, categoryId, warehouseId, status }),
    productFilterOptions(),
  ]);
  const archivedView = status === "archived";

  return (
    <Page>
      <PageHeader
        title={t("title")}
        actions={[
          <LinkButton key="import" href="/admin/products/import">
            {t("import")}
          </LinkButton>,
          <LinkButton key="new" href="/admin/products/new" variant="primary" icon="new">
            {t("new")}
          </LinkButton>,
        ]}
      />
      <FilterBar>
        <SearchInput label={t("search")} defaultValue={query} />
        <select name="brand" defaultValue={brandId ?? ""} aria-label={t("colBrand")} className={fieldClass}>
          <option value="">{t("allBrands")}</option>
          {options.brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select name="category" defaultValue={categoryId ?? ""} aria-label={t("colCategory")} className={fieldClass}>
          <option value="">{t("allCategories")}</option>
          {options.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.depth ? `— ${c.name}` : c.name}
            </option>
          ))}
        </select>
        <select name="warehouse" defaultValue={warehouseId ?? ""} aria-label={t("warehouse")} className={fieldClass}>
          <option value="">{t("allWarehouses")}</option>
          {options.warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={status} aria-label={t("colStatus")} className={fieldClass}>
          {PRODUCT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </select>
        <FilterButton>{tc("filter")}</FilterButton>
        {(query || brandId || categoryId || warehouseId || status !== "active") && (
          <Link href="/admin/products" className="text-sm text-primary underline">
            {t("clearFilters")}
          </Link>
        )}
      </FilterBar>
      <p className="text-sm text-muted-foreground">{t("count", { count: products.length })}</p>
      <BulkPublishBar total={products.length} archivedView={archivedView} warehouses={options.warehouses} />
      <DataTable
        stack
        empty={t("empty")}
        head={[
          <span key="sel" className="sr-only">{t("colSelect")}</span>,
          t("colName"),
          t("colBrand"),
          t("colCategory"),
          t("warehouse"),
          t("colVariants"),
          t("colStatus"),
          t("colActions"),
        ]}
      >
        {products.map((p) => (
          <tr key={p.id}>
            <Td className="w-8">
              <BulkCheckbox id={p.id} label={t("selectProduct", { name: p.name })} />
            </Td>
            <Td>
              <Link href={`/admin/products/${p.id}`} className="text-primary underline">
                {p.name}
              </Link>
              <div className="font-mono text-xs text-muted-foreground">{p.slug}</div>
            </Td>
            <Td label={t("colBrand")}>{p.brand}</Td>
            <Td label={t("colCategory")}>{p.category}</Td>
            <Td label={t("warehouse")}>{p.warehouse}</Td>
            <Td label={t("colVariants")}>
              <ul className="space-y-0.5 text-xs">
                {p.variants.map((v) => (
                  <li key={v.sku}>
                    <span className="font-mono">{v.sku}</span> · {v.label} · {fmtInt(v.priceMmk)} MMK{" "}
                    {v.isBundle && <Badge tone="brand">combo</Badge>}
                  </li>
                ))}
              </ul>
            </Td>
            <Td label={t("colStatus")}>
              {p.archived ? (
                <Badge tone="warning">{t("archived")}</Badge>
              ) : (
                <Badge tone={p.published ? "success" : "neutral"}>{p.published ? t("published") : t("hidden")}</Badge>
              )}
            </Td>
            <Td label={t("colActions")}>
              <div className="flex flex-wrap gap-2">
                <LinkButton href={`/admin/products/${p.id}`}>{t("edit")}</LinkButton>
                <RowProductAction id={p.id} name={p.name} kind={p.archived ? "restore" : "delete"} />
              </div>
            </Td>
          </tr>
        ))}
      </DataTable>
      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Section title={t("newBrand")}>
          <BrandForm />
        </Section>
        <Section title={t("newCategory")}>
          {/* Thêm/sửa danh mục + icon: trang Danh mục (P6). */}
          <LinkButton href="/admin/categories">{tn("categories")} →</LinkButton>
        </Section>
      </div>
    </Page>
  );
}
