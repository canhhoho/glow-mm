import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { productFormOptions } from "@/server/catalog/admin-queries";
import { ProductForm } from "@/components/admin/product-form";
import { Page, PageHeader } from "@/components/admin/ui";

export default async function NewProductPage() {
  await requirePagePermission("catalog:manage");
  const [t, td, options] = await Promise.all([getTranslations("Products"), getTranslations("Docs"), productFormOptions()]);
  return (
    <Page>
      <PageHeader title={t("new")} back={{ href: "/admin/products", label: td("back") }} />
      <ProductForm initial={null} options={options} />
    </Page>
  );
}
