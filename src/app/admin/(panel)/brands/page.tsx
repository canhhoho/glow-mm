import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/server/auth/session";
import { BrandForm } from "@/components/admin/catalog-forms";
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
    <DataTable head={[t("brandName"), tn("products")]} numeric={[1]}>
      {brands.map(brand => <tr key={brand.id}><Td>{brand.name}</Td><Td className="text-right tabular-nums">{brand._count.products}</Td></tr>)}
    </DataTable>
  </Page>;
}
