import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import type { Permission } from "@/server/auth/roles";
import { batchesForForms, listLocations, listShipments, listVariantsForPicker, listVariantsForReceive } from "@/server/inventory/queries";
import { DocumentForm } from "@/components/admin/document-form";
import { ReceiveBulkForm } from "@/components/admin/receive-bulk-form";
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
  if (type === "RECEIVE") {
    const [t, locations, variants, shipments] = await Promise.all([getTranslations("Docs"), listLocations(), listVariantsForReceive(), listShipments()]);
    return (
      <Page>
        <PageHeader title={`${t("new")}: ${t(type)}`} back={{ href: "/admin/inventory", label: t("back") }} />
        <ReceiveBulkForm
          locations={locations.map((l) => ({ id: l.id, code: l.code, name: l.name, sellable: l.sellable, pricingMode: l.pricingMode }))}
          shipments={shipments.map((s) => ({ id: s.id, code: s.code }))}
          variants={variants}
        />
      </Page>
    );
  }
  const [t, locations, variants, batches, shipments] = await Promise.all([
    getTranslations("Docs"),
    listLocations({ includeInactive: true }), // xuất/chuyển được tồn còn ở kho đã ngừng dùng
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
