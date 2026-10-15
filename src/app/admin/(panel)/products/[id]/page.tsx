import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { getProductForEdit, productFormOptions } from "@/server/catalog/admin-queries";
import { ProductForm } from "@/components/admin/product-form";
import { LinkButton, PageHeader } from "@/components/admin/ui";

export default async function EditProductPage({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  await requirePagePermission("catalog:manage");
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);
  const [t, td, product, options] = await Promise.all([
    getTranslations("Products"),
    getTranslations("Docs"),
    getProductForEdit(id),
    productFormOptions(),
  ]);
  if (!product) notFound();
  return (
    <div className="max-w-6xl">
      <PageHeader title={product.en.name || product.slug} actions={<LinkButton href="/admin/products">← {td("back")}</LinkButton>} />
      {saved && <p className="mb-3 text-sm text-emerald-700 dark:text-emerald-400">{t("saved")}</p>}
      {/* key: nạp lại state form sau khi lưu */}
      <ProductForm key={JSON.stringify(product)} initial={product} options={options} />
    </div>
  );
}
