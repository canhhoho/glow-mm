import Link from "next/link";
import { Pencil } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { listProductsAdmin, PRODUCT_STATUSES, parseProductStatus, productFilterOptions, type ProductStatusFilter } from "@/server/catalog/admin-queries";
import { deriveLabel } from "@/server/catalog/approval-rules";
import { loadReadiness } from "@/server/catalog/readiness";
import { PRODUCT_STEPS, productSteps, type ProductStep } from "@/server/catalog/readiness-rules";
import { prisma } from "@/lib/db";
import { BulkCheckbox, BulkPublishBar, RowProductAction } from "@/components/admin/product-bulk-publish";
import { Badge, DataTable, FilterBar, FilterButton, LinkButton, Page, PageHeader, SearchInput, Td, fieldClass } from "@/components/admin/ui";
import { fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

export default async function ProductsPage({ searchParams }: PageProps<"/admin/products">) {
  await requirePagePermission("catalog:manage");
  const sp = await searchParams;
  const query = str(sp.q);
  const brandId = str(sp.brand);
  const categoryId = str(sp.category);
  const warehouseId = str(sp.warehouse);
  const status: ProductStatusFilter = parseProductStatus(sp.status);
  // Quy trình 5 bước: lọc theo bước đang cần làm; "done" = đã đăng bán, không còn bước nào.
  const stepFilter: ProductStep | "done" | undefined = [...PRODUCT_STEPS, "done" as const].find((s) => s === sp.step);
  const [t, tc, listed, options] = await Promise.all([
    getTranslations("Products"),
    getTranslations("Common"),
    listProductsAdmin({ q: query, brandId, categoryId, warehouseId, status }),
    productFilterOptions(),
  ]);
  // D2: trạng thái mở bán (một lần cho cả trang); lọc "có thể mở bán" / "cần hoàn thiện" sau khi đánh giá.
  const readiness = await loadReadiness(prisma, listed.map((p) => p.id));
  const currentStep = new Map(
    listed.map((p) => {
      const r = readiness.get(p.id) ?? { errors: [], warnings: [], notReceivedSkus: [] };
      return [p.id, p.archived ? null : (productSteps({ published: p.published, notReceivedSkus: r.notReceivedSkus, approved: !!p.approvedAt && !p.hasChanges }, r).current ?? "done")] as const;
    }),
  );
  const products = listed.filter((p) => {
    const errors = readiness.get(p.id)?.errors.length ?? 0;
    if (stepFilter && currentStep.get(p.id) !== stepFilter) return false;
    return status === "ready" ? errors === 0 : status === "incomplete" ? errors > 0 : true;
  });
  const archivedView = status === "archived";

  return (
    <Page>
      <PageHeader
        title={t("title")}
        actions={[
          <LinkButton key="category" href="/admin/categories#new-category" icon="new" iconOnly={false}>
            {t("newCategory")}
          </LinkButton>,
          <LinkButton key="import" href="/admin/products/import">
            {t("import")}
          </LinkButton>,
          <LinkButton key="combo" href="/admin/products/new?type=combo" icon="new" iconOnly={false}>
            {t("newCombo")}
          </LinkButton>,
          <LinkButton key="new" href="/admin/products/new" variant="primary" icon="new" iconOnly={false}>
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
          {/* "Có thể mở bán / Cần hoàn thiện" thay bằng bộ lọc Bước (URL cũ vẫn dùng được). */}
          {PRODUCT_STATUSES.filter((s) => (s !== "ready" && s !== "incomplete") || s === status).map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </select>
        <select name="step" defaultValue={stepFilter ?? ""} aria-label={t("list.step")} className={fieldClass}>
          <option value="">{t("list.stepAll")}</option>
          {PRODUCT_STEPS.map((s, i) => (
            <option key={s} value={s}>
              {i + 1}. {t(`step.${s}`)}
            </option>
          ))}
          <option value="done">{t("list.stepDone")}</option>
        </select>
        <FilterButton>{tc("filter")}</FilterButton>
        {(query || brandId || categoryId || warehouseId || status !== "active" || stepFilter) && (
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
          t("list.step"),
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
            <Td label={t("list.step")}>
              {(() => {
                const cur = currentStep.get(p.id);
                if (!cur) return <span className="text-muted-foreground">—</span>;
                return (
                  <Link href={`/admin/products/${p.id}${cur === "done" ? "" : `#step-${cur}`}`} data-testid="product-step" data-step={cur}>
                    <Badge tone={cur === "done" ? "success" : "brand"}>
                      {cur === "done" ? t("list.stepDone") : `${PRODUCT_STEPS.indexOf(cur) + 1}. ${t(`step.${cur}`)}`}
                    </Badge>
                  </Link>
                );
              })()}
            </Td>
            <Td label={t("colStatus")}>
              {(() => {
                const r = readiness.get(p.id) ?? { errors: [], warnings: [] };
                const lab = deriveLabel(p);
                const tone = { ARCHIVED: "neutral", PUBLISHED: "success", HIDDEN: "neutral", PENDING: "brand", REJECTED: "danger", DRAFT: "warning" } as const;
                return (
                  <div className="flex flex-col items-start gap-1" data-testid="product-readiness" data-label={lab.label}>
                    <Badge tone={tone[lab.label]}>{t(`lifecycle.${lab.label}`)}</Badge>
                    {lab.change && <Badge tone={lab.change === "REJECTED" ? "danger" : "warning"}>{t(`change.${lab.change}`)}</Badge>}
                    {!p.archived && r.errors.length > 0 && (
                      <span className="text-xs text-destructive">{r.errors.map((e) => t(`readiness.issue.${e.code}`)).join(", ")}</span>
                    )}
                  </div>
                );
              })()}
            </Td>
            <Td label={t("colActions")}>
              <div className="flex flex-nowrap items-center gap-2">
                <Link
                  href={`/admin/products/${p.id}`}
                  className={cn(buttonVariants({ variant: "outline", size: "icon-lg" }))}
                  aria-label={`${t("edit")} ${p.name}`}
                  title={t("edit")}
                >
                  <Pencil aria-hidden="true" />
                </Link>
                <RowProductAction id={p.id} name={p.name} kind={p.archived ? "restore" : "delete"} />
              </div>
            </Td>
          </tr>
        ))}
      </DataTable>
    </Page>
  );
}
