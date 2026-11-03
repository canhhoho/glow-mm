import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { listProductsAdmin } from "@/server/catalog/admin-queries";
import { BrandForm } from "@/components/admin/catalog-forms";
import { Badge, DataTable, FilterBar, FilterButton, LinkButton, Page, PageHeader, SearchInput, Section, Td } from "@/components/admin/ui";
import { fmtInt } from "@/lib/format";

export default async function ProductsPage({ searchParams }: PageProps<"/admin/products">) {
  await requirePagePermission("catalog:manage");
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : undefined;
  const [t, tn, tc, products] = await Promise.all([
    getTranslations("Products"),
    getTranslations("Nav"),
    getTranslations("Common"),
    listProductsAdmin(query),
  ]);

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
        <FilterButton>{tc("filter")}</FilterButton>
      </FilterBar>
      <DataTable stack empty={t("empty")} head={[t("colName"), t("colBrand"), t("colCategory"), t("colVariants"), t("colStatus"), t("edit")]}>
        {products.map((p) => (
          <tr key={p.id}>
            <Td>
              <Link href={`/admin/products/${p.id}`} className="text-primary underline">
                {p.name}
              </Link>
              <div className="font-mono text-xs text-muted-foreground">{p.slug}</div>
            </Td>
            <Td label={t("colBrand")}>{p.brand}</Td>
            <Td label={t("colCategory")}>{p.category}</Td>
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
              <Badge tone={p.published ? "success" : "neutral"}>{p.published ? t("published") : t("hidden")}</Badge>
            </Td>
            <Td label={t("edit")}>
              <LinkButton href={`/admin/products/${p.id}`}>{t("edit")}</LinkButton>
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
