import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import type { Permission } from "@/server/auth/roles";
import { batchesForForms, getDocument, listLocations, listShipments, listVariantsForPicker, listVariantsForReceive, suggestedReceiveLot } from "@/server/inventory/queries";
import { DocumentForm } from "@/components/admin/document-form";
import { ReceiveBulkForm } from "@/components/admin/receive-bulk-form";
import { lastShipRate } from "@/server/pricing/queries";
import { Page, PageHeader } from "@/components/admin/ui";
import { FEATURES } from "@/lib/features";

const TYPES: Record<string, Permission> = {
  RECEIVE: "stock:receive",
  TRANSFER: "stock:transfer",
  ISSUE: "stock:issue",
  ADJUST: "stock:adjust",
};

export default async function NewDocumentPage({ searchParams }: PageProps<"/admin/inventory/documents/new">) {
  const { type, product, from } = await searchParams;
  if (typeof type !== "string" || !TYPES[type]) notFound();
  await requirePagePermission(TYPES[type]);
  if (type === "RECEIVE") {
    // Chuyến hàng + cước tạm tính đang tắt (`lib/features.ts`): không tải danh sách chuyến / cước gần nhất.
    const [t, locations, variants, shipments, lastShip] = await Promise.all([
      getTranslations("Docs"),
      listLocations(),
      listVariantsForReceive(),
      FEATURES.shipments ? listShipments() : Promise.resolve([]),
      FEATURES.shipments ? lastShipRate() : Promise.resolve(null),
    ]);
    return (
      <Page>
        <PageHeader title={`${t("new")}: ${t(type)}`} back={{ href: "/admin/inventory", label: t("back") }} />
        <ReceiveBulkForm
          lastShip={lastShip}
          locations={locations.map((l) => ({ id: l.id, code: l.code, name: l.name, sellable: l.sellable, pricingMode: l.pricingMode }))}
          shipments={shipments.map((s) => ({ id: s.id, code: s.code }))}
          variants={variants}
          productId={typeof product === "string" ? product : undefined}
          suggestedLot={suggestedReceiveLot()}
        />
      </Page>
    );
  }
  const [t, locations, variants, batches, shipments] = await Promise.all([
    getTranslations("Docs"),
    listLocations({ includeInactive: true }), // kho ĐI gồm kho đã ngừng dùng (dọn tồn cũ); form tự lọc kho ĐẾN / điều chỉnh
    listVariantsForPicker(),
    batchesForForms(),
    FEATURES.shipments ? listShipments() : Promise.resolve([]),
  ]);
  // "Huỷ và tạo lại" (#5): chỉ phiếu NHÁP cùng loại, không phải phiếu Nhập; sai điều kiện → form trống như thường.
  const old = typeof from === "string" && type !== "RECEIVE" ? await getDocument(from) : null;
  const replace =
    old && old.status === "DRAFT" && old.type === type
      ? {
          id: old.id,
          code: old.code,
          fromId: old.fromId ?? "",
          toId: old.toId ?? "",
          reason: old.reason ?? "",
          lines: old.lines.map((l) => ({ variantId: l.variantId, batchId: l.batchId ?? "", qty: l.qty, stockType: l.stockType })),
        }
      : undefined;
  return (
    <Page>
      <PageHeader title={`${t("new")}: ${t(type)}`} back={{ href: "/admin/inventory", label: t("back") }} />
      {/* key: cùng route /new với query khác (type, from) → dựng lại form, không giữ state của lần mở trước. */}
      <DocumentForm
        key={`${type}|${replace?.id ?? ""}`}
        replace={replace}
        type={type as "RECEIVE" | "TRANSFER" | "ISSUE" | "ADJUST"}
        data={{
          locations: locations.map((l) => ({ id: l.id, code: l.code, name: l.name, type: l.type, active: l.active })),
          variants,
          batches,
          shipments: shipments.map((s) => ({ id: s.id, code: s.code })),
        }}
      />
    </Page>
  );
}
