import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { requirePagePermission } from "@/server/auth/session";
import { getProductForEdit, productCopyOptions, productFormOptions } from "@/server/catalog/admin-queries";
import { productCopyDraft } from "@/server/catalog/product-copy";
import { ProductForm } from "@/components/admin/product-form";
import { Button } from "@/components/ui/button";
import { fieldClass, Page, PageHeader } from "@/components/admin/ui";

export default async function NewProductPage({ searchParams }: PageProps<"/admin/products/new">) {
  await requirePagePermission("catalog:manage");
  const { copyFrom } = await searchParams;
  const sourceId = typeof copyFrom === "string" ? copyFrom : "";
  const [t, td, options, sources, source] = await Promise.all([
    getTranslations("Products"), getTranslations("Docs"), productFormOptions(), productCopyOptions(),
    sourceId ? getProductForEdit(sourceId) : Promise.resolve(null),
  ]);
  if (sourceId && !source) notFound();
  return (
    <Page>
      <PageHeader title={t("new")} back={{ href: "/admin/products", label: td("back") }} />
      <details open={!!source} className="mb-6 rounded-lg border p-4">
        <summary className="cursor-pointer font-medium">{t("copyFrom")}</summary>
        <form action="/admin/products/new" method="get" className="mt-3 flex flex-wrap items-end gap-2">
          <label className="grid min-w-0 flex-1 gap-1 text-sm">
            <span>{t("copySource")}</span>
            <select key={sourceId} name="copyFrom" defaultValue={sourceId} required className={fieldClass}>
              <option value="">—</option>
              {sources.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <Button type="submit" size="lg" variant="outline" disabled={sources.length === 0}>{t("copyLoad")}</Button>
        </form>
        <p className="mt-2 text-sm text-muted-foreground">{t("copyHelp")}</p>
        {source && <p role="status" className="mt-2 text-sm">{t("copyLoaded", { name: source.en.name || source.my.name || source.slug })}</p>}
      </details>
      <ProductForm key={sourceId} initial={source ? productCopyDraft(source) : null} options={options} copySourceId={source?.id} />
    </Page>
  );
}
