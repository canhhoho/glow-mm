import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { productFormOptions } from "@/server/catalog/admin-queries";
import { ProductForm } from "@/components/admin/product-form";
import { LinkButton, PageHeader } from "@/components/admin/ui";

export default async function NewProductPage() {
  await requirePagePermission("catalog:manage");
  const [t, td, options] = await Promise.all([getTranslations("Products"), getTranslations("Docs"), productFormOptions()]);
  return (
    <div className="max-w-6xl">
      <PageHeader title={t("new")} actions={<LinkButton href="/admin/products">← {td("back")}</LinkButton>} />
      <ProductForm initial={null} options={options} />
    </div>
  );
}
