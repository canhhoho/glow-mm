import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { ImportForm } from "@/components/admin/catalog-forms";
import { Page, PageHeader } from "@/components/admin/ui";
import { OpeningImport } from "@/components/admin/opening-import";
import { listLocations } from "@/server/inventory/queries";
import { prisma } from "@/lib/db";

export default async function ImportPage() {
  await requirePagePermission("catalog:manage");
  const [t, td, locations] = await Promise.all([getTranslations("Products"), getTranslations("Docs"), listLocations()]);
  const defaultLocation = await prisma.setting.findUnique({ where: { key: "catalog.defaultLocationCode" } });
  return (
    <Page>
      <PageHeader title={t("import")} back={{ href: "/admin/products", label: td("back") }} />
      <OpeningImport locations={locations} defaultLocation={typeof defaultLocation?.value === "string" ? defaultLocation.value : undefined} />
      <details className="space-y-4 rounded-xl border p-4">
      <summary className="cursor-pointer font-medium">{t("separateImport")}</summary>
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
      </details>
    </Page>
  );
}
