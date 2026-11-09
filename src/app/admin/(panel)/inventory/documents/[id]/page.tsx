import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/auth/roles";
import { prisma } from "@/lib/db";
import { getDocument, productName } from "@/server/inventory/queries";
import { cancelDocumentAction, postDocumentAction } from "@/server/inventory/actions";
import { ActionButton } from "@/components/admin/action-button";
import { Badge, DataTable, LinkButton, Notice, Page, PageHeader, Td } from "@/components/admin/ui";
import { fmtDate, fmtDay, fmtInt } from "@/lib/format";

const STATUS_TONE = { DRAFT: "warning", POSTED: "success", CANCELLED: "neutral" } as const;

export default async function DocumentPage({ params }: PageProps<"/admin/inventory/documents/[id]">) {
  const user = await requirePagePermission("stock:view");
  const { id } = await params;
  const [t, ti, doc] = await Promise.all([getTranslations("Docs"), getTranslations("Inventory"), getDocument(id)]);
  if (!doc) notFound();
  const picked = doc.status === "DRAFT" && ["ISSUE", "TRANSFER"].includes(doc.type) && doc.fromId ? await prisma.orderPickLine.findMany({ where: { locationId: doc.fromId, variantId: { in: doc.lines.map(l=>l.variantId) }, pick: { consumedAt: null, order: { status: { in: ["COD_CONFIRMED", "PAYMENT_CONFIRMED"] } } } }, select: { pick: { select: { order: { select: { code: true } } } } }, take: 50 }) : [];

  return (
    <Page>
      <PageHeader
        title={`${t(doc.type)} · ${doc.code}`}
        back={{ href: "/admin/inventory/documents", label: t("back") }}
      />
      {doc.type === "RECEIVE" && doc.status === "POSTED" && can(user.role, "pricing:manage") && <LinkButton href={`/admin/pricing?tab=runs&receiptId=${doc.id}`}>{t("priceReceived")}</LinkButton>}
      {picked.length > 0 && <Notice tone="warning">{t("pickedWarning", { codes: [...new Set(picked.map(p=>p.pick.order.code))].join(", ") })}</Notice>}
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">{t("status")}</dt>
        <dd>
          <Badge tone={STATUS_TONE[doc.status]}>{t(doc.status)}</Badge>
        </dd>
        {doc.from && (
          <>
            <dt className="text-muted-foreground">{t("from")}</dt>
            <dd className="font-mono text-xs">
              {doc.from.code} — {doc.from.name}
            </dd>
          </>
        )}
        {doc.to && (
          <>
            <dt className="text-muted-foreground">{doc.type === "ADJUST" ? t("location") : t("to")}</dt>
            <dd className="font-mono text-xs">
              {doc.to.code} — {doc.to.name}
            </dd>
          </>
        )}
        {doc.shipment && (
          <>
            <dt className="text-muted-foreground">{t("shipment")}</dt>
            <dd>{doc.shipment.code}</dd>
          </>
        )}
        {doc.reason && (
          <>
            <dt className="text-muted-foreground">{t("reason")}</dt>
            <dd>{doc.reason}</dd>
          </>
        )}
        {doc.estimatedShipMmkPerKg != null && (
          <>
            <dt className="text-muted-foreground">{t("estimateShip")}</dt>
            <dd>{fmtInt(doc.estimatedShipMmkPerKg)}</dd>
          </>
        )}
        <dt className="text-muted-foreground">{t("createdAt")}</dt>
        <dd>{fmtDate(doc.createdAt)}</dd>
      </dl>

      <DataTable head={[t("variant"), t("lotNo"), t("expiry"), t("stockType"), t("qty")]}>
        {doc.lines.map((l) => (
          <tr key={l.id}>
            <Td>
              <span className="font-mono text-xs">{l.variant.sku}</span>{" "}
              {productName(l.variant.product.translations, l.variant.product.slug)} ({l.variant.label})
            </Td>
            <Td className="font-mono text-xs">{l.batch?.lotNo ?? t("autoFefo")}</Td>
            <Td>{l.batch?.expiryStatus === "NONE" ? ti("expiryNone") : l.batch?.expiryStatus === "UNKNOWN" ? ti("expiryUnknown") : fmtDay(l.batch?.expiryDate)}</Td>
            <Td>{ti(l.stockType)}</Td>
            <Td className="text-right tabular-nums">{fmtInt(l.qty)}</Td>
          </tr>
        ))}
      </DataTable>

      {doc.status === "DRAFT" ? (
        <div className="flex flex-wrap gap-3">
          <ActionButton
            action={postDocumentAction}
            fields={{ id: doc.id }}
            label={t("post")}
            confirm={t("postConfirm", { code: doc.code })}
          />
          <ActionButton
            action={cancelDocumentAction}
            fields={{ id: doc.id }}
            label={t("cancel")}
            variant="outline"
            confirm={t("cancelConfirm", { code: doc.code })}
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{doc.status === "CANCELLED" ? t("cancelledNote") : t("postedNote")}</p>
      )}
    </Page>
  );
}
