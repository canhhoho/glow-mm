import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { getProductForEdit, getProductImages, productFormOptions } from "@/server/catalog/admin-queries";
import { deleteProductImageAction, reorderProductImageAction, updateProductImageAltAction } from "@/server/catalog/actions";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm } from "@/components/admin/action-form";
import { ProductForm } from "@/components/admin/product-form";
import { ProductImageUpload } from "@/components/admin/product-images";
import { Badge, fieldClass, LinkButton, PageHeader } from "@/components/admin/ui";

export default async function EditProductPage({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  await requirePagePermission("catalog:manage");
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);
  const [t, td, product, options, images] = await Promise.all([
    getTranslations("Products"),
    getTranslations("Docs"),
    getProductForEdit(id),
    productFormOptions(),
    getProductImages(id),
  ]);
  if (!product) notFound();
  return (
    <div className="max-w-6xl">
      <PageHeader title={product.en.name || product.slug} actions={<LinkButton href="/admin/products">← {td("back")}</LinkButton>} />
      {saved && <p className="mb-3 text-sm text-emerald-700 dark:text-emerald-400">{t("saved")}</p>}
      <section aria-labelledby="product-images" className="mb-6 rounded-lg border p-4">
        <h2 id="product-images" className="mb-3 font-medium">
          {t("images")}
        </h2>
        <ProductImageUpload productId={product.id} />
        {images.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("imagesEmpty")}</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {images.map((img, i) => (
              <li key={img.id} data-testid="product-image" className="flex flex-wrap items-start gap-3 rounded-md border p-2">
                <div className="relative size-24 shrink-0 overflow-hidden rounded-md bg-muted">
                  <Image src={img.url} alt={img.alt || product.en.name} fill sizes="96px" className="object-cover" />
                </div>
                <div className="min-w-48 flex-1 space-y-2">
                  {i === 0 && <Badge tone="brand">{t("imagesCover")}</Badge>}
                  <ActionForm
                    action={updateProductImageAltAction}
                    submitLabel={t("imagesSaveAlt")}
                    okText={t("saved")}
                    variant="outline"
                    className="flex flex-wrap items-end gap-2"
                  >
                    <input type="hidden" name="imageId" value={img.id} />
                    <label className="space-y-1 text-sm">
                      <span className="text-muted-foreground">{t("imagesAlt")}</span>
                      <input name="alt" defaultValue={img.alt} maxLength={200} className={fieldClass} />
                    </label>
                  </ActionForm>
                </div>
                <div className="flex flex-wrap gap-2">
                  {i > 0 && (
                    <ActionButton action={reorderProductImageAction} fields={{ imageId: img.id, direction: "up" }} label={`↑ ${t("imagesUp")}`} variant="outline" />
                  )}
                  {i < images.length - 1 && (
                    <ActionButton action={reorderProductImageAction} fields={{ imageId: img.id, direction: "down" }} label={`↓ ${t("imagesDown")}`} variant="outline" />
                  )}
                  <ActionButton
                    action={deleteProductImageAction}
                    fields={{ imageId: img.id }}
                    label={t("imagesDelete")}
                    variant="destructive"
                    confirm={t("imagesDeleteConfirm")}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {/* key: nạp lại state form sau khi lưu */}
      <ProductForm key={JSON.stringify(product)} initial={product} options={options} />
    </div>
  );
}
