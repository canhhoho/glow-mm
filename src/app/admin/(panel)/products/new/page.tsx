import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { requirePagePermission } from "@/server/auth/session";
import { getProductForEdit, productCopyOptions, productFormOptions } from "@/server/catalog/admin-queries";
import { ProductCreateForm, type CreatePrefill } from "@/components/admin/product-create-form";
import { Button } from "@/components/ui/button";
import { fieldClass, fieldLabelClass, LinkButton, Page, PageHeader } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

/**
 * Bước 1 "Tạo sản phẩm" (5 ô) — `?type=combo` tạo combo; `?copyFrom=<id>` điền sẵn từ SP cũ (không chép giá).
 * Các bước sau (nhập kho, giá, duyệt, đăng bán) làm trên trang chi tiết SP.
 */
export default async function NewProductPage({ searchParams }: PageProps<"/admin/products/new">) {
  await requirePagePermission("catalog:manage");
  const { copyFrom, type } = await searchParams;
  const sourceId = typeof copyFrom === "string" ? copyFrom : "";
  const [t, td, options, sources, source] = await Promise.all([
    getTranslations("Products"), getTranslations("Docs"), productFormOptions(), productCopyOptions(),
    sourceId ? getProductForEdit(sourceId) : Promise.resolve(null),
  ]);
  if (sourceId && !source) notFound();

  const sourceIsCombo = !!source?.variants.some((v) => v.isBundle);
  const kind = type === "combo" || sourceIsCombo ? "combo" : "product";
  const prefill: CreatePrefill | undefined = source
    ? {
        copyFromId: source.id,
        nameMy: source.my.name,
        nameEn: source.en.name,
        brandName: options.brands.find((b) => b.id === source.brandId)?.name ?? "",
        categoryId: source.categoryId,
        stockLocationId: source.stockLocationId,
        // Một loại "Tiêu chuẩn" → để trống (form tự tạo lại loại chuẩn).
        labels: source.variants.length > 1 ? source.variants.filter((v) => !v.isBundle).map((v) => v.label) : [],
        components: source.variants.find((v) => v.isBundle)?.components ?? [],
      }
    : undefined;

  return (
    <Page>
      <PageHeader
        title={kind === "combo" ? t("create.comboTitle") : t("new")}
        back={{ href: "/admin/products", label: td("back") }}
        actions={!source && <LinkButton href={kind === "combo" ? "/admin/products/new" : "/admin/products/new?type=combo"} icon="new">{kind === "combo" ? t("new") : t("newCombo")}</LinkButton>}
      />
      <details open={!!source} className="max-w-2xl rounded-lg border p-4">
        <summary className="cursor-pointer font-medium">{t("copyFrom")}</summary>
        <form action="/admin/products/new" method="get" className="mt-3 flex flex-wrap items-end gap-2">
          <label className={cn(fieldLabelClass, "min-w-0 flex-1")}>
            <span>{t("copySource")}</span>
            <select key={sourceId} name="copyFrom" defaultValue={sourceId} required className={fieldClass}>
              <option value="">—</option>
              {sources.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <Button type="submit" size="lg" variant="outline" disabled={sources.length === 0}>{t("copyLoad")}</Button>
        </form>
        <p className="mt-2 text-sm text-muted-foreground">{t("create.copyHelp")}</p>
        {source && <p role="status" className="mt-2 text-sm">{t("copyLoaded", { name: source.en.name || source.my.name || source.slug })}</p>}
      </details>
      <ProductCreateForm key={`${kind}-${sourceId}`} kind={kind} options={options} prefill={prefill} />
    </Page>
  );
}
