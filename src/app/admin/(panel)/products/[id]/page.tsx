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
import Link from "next/link";
import { Badge, fieldClass, Page, PageHeader } from "@/components/admin/ui";
import { loadReadiness } from "@/server/catalog/readiness";
import { localizedPath } from "@/lib/site";
import { prisma } from "@/lib/db";

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
  // D2: cùng bộ kiểm tra với lúc lưu / bật hàng loạt / danh sách.
  const readiness = (await loadReadiness(prisma, [product.id])).get(product.id) ?? { errors: [], warnings: [] };
  const issues = [
    ...readiness.errors.map((i) => ({ ...i, tone: "danger" as const, kind: t("readiness.error") })),
    ...readiness.warnings.map((i) => ({ ...i, tone: "warning" as const, kind: t("readiness.warning") })),
  ];
  const steps = [
    { href: "#product-images", label: t("readiness.stepImages") },
    { href: "/admin/inventory/documents/new?type=RECEIVE", label: t("readiness.stepReceive") },
    { href: "/admin/pricing?tab=runs", label: t("readiness.stepPrice") },
    { href: localizedPath("my", `/p/${product.slug}`), label: t("readiness.stepView"), external: true },
  ];
  return (
    <Page>
      <PageHeader title={product.en.name || product.slug} back={{ href: "/admin/products", label: td("back") }} />
      {saved && <p className="mb-3 text-sm text-emerald-700 dark:text-emerald-400">{t("saved")}</p>}
      <section id="product-images" aria-labelledby="product-images-title" className="mb-6 scroll-mt-20 rounded-lg border p-4">
        <h2 id="product-images-title" className="mb-3 font-medium">
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
                    <label className="grid content-start gap-1 text-sm">
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
      <section className="space-y-3 rounded-xl border p-4" data-testid="launch-check">
        <h2 className="font-medium">{t("launchCheck")}</h2>
        <p className="text-sm">
          {readiness.errors.length > 0
            ? t(product.published ? "readiness.publishedWithErrors" : "readiness.blockedHint", { count: readiness.errors.length })
            : t(product.published ? "readiness.publishedOk" : "readiness.readyHint")}
        </p>
        {issues.length > 0 ? (
          <ul className="space-y-1.5 text-sm">
            {issues.map((i) => (
              <li key={i.code} className="flex flex-wrap items-start gap-2" data-testid={`issue-${i.code}`}>
                <Badge tone={i.tone}>{i.kind}</Badge>
                <span>
                  {t(`readiness.issue.${i.code}`)}
                  {i.skus?.length ? <span className="font-mono text-xs text-muted-foreground"> · {i.skus.join(", ")}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Badge tone="success">✓ {t("readiness.allGood")}</Badge>
        )}
        <nav aria-label={t("readiness.steps")} className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-3 text-sm">
          <span className="text-muted-foreground">{t("readiness.steps")}:</span>
          {steps.map((s, n) => (
            <span key={s.href} className="flex items-center gap-2">
              {n > 0 && <span aria-hidden>→</span>}
              <Link href={s.href} className="text-primary underline" {...(s.external && { target: "_blank", rel: "noreferrer" })}>
                {s.label}
              </Link>
            </span>
          ))}
          <span aria-hidden>→</span>
          <span>{t("readiness.stepPublish")}</span>
        </nav>
      </section>
      {/* key: nạp lại state form sau khi lưu */}
      <ProductForm key={JSON.stringify(product)} initial={product} options={options} />
    </Page>
  );
}
