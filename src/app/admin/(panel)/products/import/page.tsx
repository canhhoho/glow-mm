import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { ImportForm } from "@/components/admin/catalog-forms";
import { Page, PageHeader } from "@/components/admin/ui";

export default async function ImportPage() {
  await requirePagePermission("catalog:manage");
  const [t, td] = await Promise.all([getTranslations("Products"), getTranslations("Docs")]);
  return (
    <Page>
      <PageHeader title={t("import")} back={{ href: "/admin/products", label: td("back") }} />
      <section className="space-y-2 rounded-lg border p-4">
        <h2 className="font-medium">1. {t("importProducts")}</h2>
        <p className="text-sm text-muted-foreground">{t("importHelp")}</p>
        <ImportForm kind="products" />
      </section>
      <section className="space-y-2 rounded-lg border p-4">
        <h2 className="font-medium">2. {t("importStock")}</h2>
        <p className="text-sm text-muted-foreground">{t("stockHelp")}</p>
        <ImportForm kind="stock" />
      </section>
    </Page>
  );
}
