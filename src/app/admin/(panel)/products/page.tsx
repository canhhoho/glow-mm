import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { listProductsAdmin } from "@/server/catalog/admin-queries";
import { BrandForm, CategoryForm } from "@/components/admin/catalog-forms";
import { Badge, DataTable, fieldClass, LinkButton, PageHeader, Td } from "@/components/admin/ui";
import { fmtInt } from "@/lib/format";

export default async function ProductsPage({ searchParams }: PageProps<"/admin/products">) {
  await requirePagePermission("catalog:manage");
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : undefined;
  const [t, products] = await Promise.all([getTranslations("Products"), listProductsAdmin(query)]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        actions={[
          <LinkButton key="new" href="/admin/products/new" variant="primary">
            + {t("new")}
          </LinkButton>,
          <LinkButton key="import" href="/admin/products/import">
            {t("import")}
          </LinkButton>,
        ]}
      />
      <form role="search" className="flex gap-2">
        <input name="q" defaultValue={query} placeholder={t("search")} className={`${fieldClass} max-w-xs`} />
      </form>
      <DataTable empty={t("empty")} head={[t("colName"), t("colBrand"), t("colCategory"), t("colVariants"), t("colStatus")]}>
        {products.map((p) => (
          <tr key={p.id}>
            <Td>
              <Link href={`/admin/products/${p.id}`} className="text-primary underline">
                {p.name}
              </Link>
              <div className="font-mono text-xs text-muted-foreground">{p.slug}</div>
            </Td>
            <Td>{p.brand}</Td>
            <Td>{p.category}</Td>
            <Td>
              <ul className="space-y-0.5 text-xs">
                {p.variants.map((v) => (
                  <li key={v.sku}>
                    <span className="font-mono">{v.sku}</span> · {v.label} · {fmtInt(v.priceMmk)} MMK{" "}
                    {v.isBundle && <Badge tone="brand">combo</Badge>}
                  </li>
                ))}
              </ul>
            </Td>
            <Td>
              <Badge tone={p.published ? "success" : "neutral"}>{p.published ? t("published") : t("hidden")}</Badge>
            </Td>
          </tr>
        ))}
      </DataTable>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border p-4">
          <h2 className="mb-3 font-medium">{t("newBrand")}</h2>
          <BrandForm />
        </section>
        <section className="rounded-lg border p-4">
          <h2 className="mb-3 font-medium">{t("newCategory")}</h2>
          <CategoryForm />
        </section>
      </div>
    </div>
  );
}
