import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import type { Permission } from "@/server/auth/roles";
import { batchesForForms, listLocations, listShipments, listVariantsForPicker } from "@/server/inventory/queries";
import { DocumentForm } from "@/components/admin/document-form";
import { Page, PageHeader } from "@/components/admin/ui";

const TYPES: Record<string, Permission> = {
  RECEIVE: "stock:receive",
  TRANSFER: "stock:transfer",
  ISSUE: "stock:issue",
  ADJUST: "stock:adjust",
};

export default async function NewDocumentPage({ searchParams }: PageProps<"/admin/inventory/documents/new">) {
  const { type } = await searchParams;
  if (typeof type !== "string" || !TYPES[type]) notFound();
  await requirePagePermission(TYPES[type]);
  const [t, locations, variants, batches, shipments] = await Promise.all([
    getTranslations("Docs"),
    listLocations(),
    listVariantsForPicker(),
    batchesForForms(),
    listShipments(),
  ]);
  return (
    <Page>
      <PageHeader title={`${t("new")}: ${t(type)}`} back={{ href: "/admin/inventory", label: t("back") }} />
      <DocumentForm
        type={type as "RECEIVE" | "TRANSFER" | "ISSUE" | "ADJUST"}
        data={{
          locations: locations.map((l) => ({ id: l.id, code: l.code, name: l.name, type: l.type })),
          variants,
          batches,
          shipments: shipments.map((s) => ({ id: s.id, code: s.code })),
        }}
      />
    </Page>
  );
}
