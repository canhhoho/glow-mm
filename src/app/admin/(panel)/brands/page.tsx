import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { prisma } from "@/lib/db";
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
    prisma.brand.findMany({
      where: q ? { name: { contains: q, mode: "insensitive" } } : {},
      orderBy: { name: "asc" }, include: { _count: { select: { products: true } } }, take: 200,
    }),
  ]);
  return <Page>
    <PageHeader title={tn("brands")} />
    <FilterBar>
      <SearchInput label={t("brandName")} defaultValue={q} />
      <FilterButton>{tc("filter")}</FilterButton>
    </FilterBar>
    <Section title={t("newBrand")}><BrandForm /></Section>
    <DataTable stack empty={t("brandsEmpty")} head={[t("brandName"), tn("products"), t("colActions")]} numeric={[1]}>
      {brands.map(brand => <tr key={brand.id}>
        <Td>{brand.name}</Td>
        <Td label={tn("products")} className="text-right tabular-nums">
          <Link href={`/admin/products?brand=${encodeURIComponent(brand.id)}`} className="text-primary underline" aria-label={t("brandViewProducts", { name: brand.name })}>{brand._count.products}</Link>
        </Td>
        <Td label={t("colActions")}><BrandActions id={brand.id} name={brand.name} products={brand._count.products} /></Td>
      </tr>)}
    </DataTable>
  </Page>;
}
