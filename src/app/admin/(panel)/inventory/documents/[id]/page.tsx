import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { getDocument, productName } from "@/server/inventory/queries";
import { cancelDocumentAction, postDocumentAction } from "@/server/inventory/actions";
import { ActionButton } from "@/components/admin/action-button";
import { Badge, DataTable, LinkButton, PageHeader, Td } from "@/components/admin/ui";
import { fmtDate, fmtDay, fmtInt } from "@/lib/format";

const STATUS_TONE = { DRAFT: "warning", POSTED: "success", CANCELLED: "neutral" } as const;

export default async function DocumentPage({ params }: PageProps<"/admin/inventory/documents/[id]">) {
  await requirePagePermission("stock:view");
  const { id } = await params;
  const [t, ti, doc] = await Promise.all([getTranslations("Docs"), getTranslations("Inventory"), getDocument(id)]);
  if (!doc) notFound();

  return (
    <div className="max-w-5xl space-y-4">
      <PageHeader
        title={`${t(doc.type)} · ${doc.code}`}
        actions={<LinkButton href="/admin/inventory/documents">← {t("back")}</LinkButton>}
      />
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
            <dt className="text-muted-foreground">{t("to")}</dt>
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
            <Td>{fmtDay(l.batch?.expiryDate)}</Td>
            <Td>{ti(l.stockType)}</Td>
            <Td className="text-right tabular-nums">{fmtInt(l.qty)}</Td>
          </tr>
        ))}
      </DataTable>

      {doc.status === "DRAFT" ? (
        <div className="flex flex-wrap gap-3">
          <ActionButton action={postDocumentAction} fields={{ id: doc.id }} label={t("post")} />
          <ActionButton action={cancelDocumentAction} fields={{ id: doc.id }} label={t("cancel")} variant="outline" />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("postedNote")}</p>
      )}
    </div>
  );
}
