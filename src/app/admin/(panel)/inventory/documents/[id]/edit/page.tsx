import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { getDocument, listLocations, listShipments, listVariantsForReceive } from "@/server/inventory/queries";
import { ReceiveBulkForm, type ReceiveDraft } from "@/components/admin/receive-bulk-form";
import { Page, PageHeader } from "@/components/admin/ui";

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

/** Sửa phiếu NHẬP đang nháp: mở lại form nhập nhiều SP với dòng đã lưu; lưu cập nhật đúng phiếu này. */
export default async function EditDocumentPage({ params }: PageProps<"/admin/inventory/documents/[id]/edit">) {
  await requirePagePermission("stock:receive");
  const { id } = await params;
  const doc = await getDocument(id);
  if (!doc) notFound();
  if (doc.type !== "RECEIVE" || doc.status !== "DRAFT") redirect(`/admin/inventory/documents/${id}`);
  const [t, locations, variants, shipments] = await Promise.all([getTranslations("Docs"), listLocations(), listVariantsForReceive({ includeIds: doc.lines.map((l) => l.variantId) }), listShipments()]);
  const draft: ReceiveDraft = {
    id: doc.id,
    toId: doc.toId ?? "",
    shipmentId: doc.shipmentId ?? "",
    reason: doc.reason ?? "",
    estimatedShip: doc.estimatedShipMmkPerKg == null ? "" : String(doc.estimatedShipMmkPerKg),
    lines: doc.lines.map((l) => ({
      variantId: l.variantId,
      qty: String(l.qty),
      lotNo: l.batch?.lotNo ?? "",
      expiryStatus: l.batch?.expiryStatus ?? "DATED",
      expiryDate: day(l.batch?.expiryDate),
      mfgDate: day(l.batch?.mfgDate),
      // A3 16/11: giá mua + phí về kho của CHÍNH dòng phiếu (không phải bình quân của lô); phí trống = chưa biết.
      unitCost: String(l.unitCostMmk ?? l.unitCostVnd ?? l.batch?.unitCostMmk ?? l.batch?.unitCostVnd ?? ""),
      inbound: l.unitCostVnd != null && l.landedCostVnd != null ? String(l.landedCostVnd - l.unitCostVnd) : "",
      stockType: l.stockType,
    })),
  };
  return (
    <Page>
      <PageHeader title={`${t("editTitle")} · ${doc.code}`} back={{ href: `/admin/inventory/documents/${doc.id}`, label: t("back") }} />
      <ReceiveBulkForm
        locations={locations.map((l) => ({ id: l.id, code: l.code, name: l.name, sellable: l.sellable, pricingMode: l.pricingMode }))}
        shipments={shipments.map((s) => ({ id: s.id, code: s.code }))}
        variants={variants}
        draft={draft}
      />
    </Page>
  );
}
