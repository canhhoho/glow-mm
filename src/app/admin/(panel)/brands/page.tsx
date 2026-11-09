import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { listBrandsAdmin } from "@/server/catalog/brand-queries";
import { requirePagePermission } from "@/server/auth/session";
import { BrandForm } from "@/components/admin/catalog-forms";
import { BrandActions } from "@/components/admin/brand-actions";
import { DataTable, FilterBar, FilterButton, Page, PageHeader, SearchInput, Section, Td } from "@/components/admin/ui";

export default async function BrandsPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  await requirePagePermission("catalog:manage");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const [t, tn, tc, brands] = await Promise.all([
    getTranslations("Products"), getTranslations("Nav"), getTranslations("Common"),
    listBrandsAdmin(q),
  ]);
  return <Page>
    <PageHeader title={tn("brands")} />
    <FilterBar>
      <SearchInput label={t("brandName")} defaultValue={q} />
      <FilterButton>{tc("filter")}</FilterButton>
    </FilterBar>
    <Section title={t("newBrand")}><BrandForm /></Section>
    <p className="text-sm text-muted-foreground">{t("brandCountsHelp")}</p>
    <DataTable stack empty={t("brandsEmpty")} head={[t("brandName"), t("brandManagedProducts"), t("brandInStockProducts"), t("colActions")]} numeric={[1, 2]}>
      {brands.map(brand => <tr key={brand.id}>
        <Td>{brand.name}</Td>
        <Td label={t("brandManagedProducts")} className="text-right tabular-nums">
          <Link href={`/admin/products?brand=${encodeURIComponent(brand.id)}`} className="text-primary underline" aria-label={t("brandViewProducts", { name: brand.name })}>{brand.managedProducts}</Link>
        </Td>
        <Td label={t("brandInStockProducts")} className="text-right tabular-nums">{brand.inStockProducts}</Td>
        <Td label={t("colActions")}><BrandActions id={brand.id} name={brand.name} products={brand.totalProducts} /></Td>
      </tr>)}
    </DataTable>
  </Page>;
}
