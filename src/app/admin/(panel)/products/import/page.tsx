import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/auth/roles";
import { CatalogImport } from "@/components/admin/catalog-import";
import { Page, PageHeader } from "@/components/admin/ui";

export default async function ImportPage() {
  const user = await requirePagePermission("catalog:manage");
  const [t, td] = await Promise.all([getTranslations("Products"), getTranslations("Docs")]);
  return (
    <Page>
      <PageHeader title={t("import")} back={{ href: "/admin/products", label: td("back") }} />
      <CatalogImport canApprove={can(user.role, "catalog:approve")} />
    </Page>
  );
}
