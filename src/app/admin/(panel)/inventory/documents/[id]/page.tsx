import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/auth/roles";
import { prisma } from "@/lib/db";
import { getDocument, loadDocumentPreview, productName } from "@/server/inventory/queries";
import { cancelDocumentAction, postDocumentAction } from "@/server/inventory/actions";
import { ActionButton } from "@/components/admin/action-button";
import { Badge, DataTable, LinkButton, Notice, Page, PageHeader, Section, Td } from "@/components/admin/ui";
import { fmtDate, fmtDay, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_TONE = { DRAFT: "warning", POSTED: "success", CANCELLED: "neutral" } as const;
/** Phiếu nháp không có trang sửa (trừ Nhập) → "Huỷ và tạo lại" mở form tạo điền sẵn; cần đúng quyền tạo loại phiếu đó (#5). */
const REPLACE_PERMISSION = { TRANSFER: "stock:transfer", ISSUE: "stock:issue", ADJUST: "stock:adjust" } as const;

export default async function DocumentPage({ params, searchParams }: PageProps<"/admin/inventory/documents/[id]">) {
  const user = await requirePagePermission("stock:view");
  const [{ id }, { updated }] = await Promise.all([params, searchParams]);
  const [t, ti, tc, doc] = await Promise.all([getTranslations("Docs"), getTranslations("Inventory"), getTranslations("Common"), getDocument(id)]);
  if (!doc) notFound();
  // QT3: phiếu nhập đã ghi sổ có hàng mà đơn đặt trước đang chờ → nhắc mở danh sách chờ.
  const waitingPreorders =
    doc.type === "RECEIVE" && doc.status === "POSTED"
      ? await prisma.order.count({ where: { status: "AWAITING_STOCK", items: { some: { variantId: { in: doc.lines.map((l) => l.variantId) } } } } })
      : 0;
  // Xem trước ảnh hưởng lên tồn trước khi ghi sổ (chỉ phiếu nháp); phiếu đã ghi sổ / huỷ không cần.
  const preview = doc.status === "DRAFT"
    ? await loadDocumentPreview({ type: doc.type, fromId: doc.fromId, toId: doc.toId, lines: doc.lines.map((l) => ({ variantId: l.variantId, qty: l.qty, stockType: l.stockType })) })
    : null;
  const locationName = new Map([doc.from, doc.to].filter((x): x is NonNullable<typeof doc.from> => !!x).map((x) => [x.id, `${x.code} — ${x.name}`]));
  const variantLabel = new Map(doc.lines.map((l) => [l.variantId, `${l.variant.sku} · ${productName(l.variant.product.translations, l.variant.product.slug)} (${l.variant.label})`]));
  // Giá mua / tỷ giá / phí về kho của từng lần nhập: chỉ người có quyền xem giá (cùng quyền đặt giá).
  const showCosts = doc.type === "RECEIVE" && can(user.role, "pricing:manage");
  const picked = doc.status === "DRAFT" && ["ISSUE", "TRANSFER"].includes(doc.type) && doc.fromId ? await prisma.orderPickLine.findMany({ where: { locationId: doc.fromId, variantId: { in: doc.lines.map(l=>l.variantId) }, pick: { consumedAt: null, order: { status: { in: ["COD_CONFIRMED", "PAYMENT_CONFIRMED"] } } } }, select: { pick: { select: { order: { select: { code: true } } } } }, take: 50 }) : [];

  return (
    <Page>
      <PageHeader
        title={`${t(doc.type)} · ${doc.code}`}
        back={{ href: "/admin/inventory/documents", label: t("back") }}
        actions={doc.type === "RECEIVE" && doc.status === "POSTED" && can(user.role, "pricing:manage") && <LinkButton href={`/admin/selling-prices?mode=auto&receiptId=${doc.id}`}>{t("priceReceived")}</LinkButton>}
      />
      {updated && <Notice tone="success">{t("updated")}</Notice>}
      {waitingPreorders > 0 && (
        <Notice tone="warning" data-testid="receipt-preorders">
          {t("preorderWaiting", { count: waitingPreorders })}{" "}
          <Link href="/admin/orders/preorders" className="underline">
            {t("preorderOpen")}
          </Link>
        </Notice>
      )}
      {picked.length > 0 && <Notice tone="warning">{t("pickedWarning", { codes: [...new Set(picked.map(p=>p.pick.order.code))].join(", ") })}</Notice>}
      <Section>
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
      </Section>

      <DataTable
        stack
        numeric={showCosts ? [4, 5, 6, 7] : [4]}
        empty={tc("noData")}
        head={[t("variant"), t("lotNo"), t("expiry"), t("stockType"), t("qty"), ...(showCosts ? [t("costUnit"), t("costRate"), t("costInbound")] : [])]}
      >
        {doc.lines.map((l) => (
          <tr key={l.id}>
            <Td>
              <span className="font-mono text-xs">{l.variant.sku}</span>{" "}
              {productName(l.variant.product.translations, l.variant.product.slug)} ({l.variant.label})
            </Td>
            <Td label={t("lotNo")} className="font-mono text-xs">{l.batch?.lotNo ?? t("autoFefo")}</Td>
            <Td label={t("expiry")}>{l.batch?.expiryStatus === "NONE" ? ti("expiryNone") : l.batch?.expiryStatus === "UNKNOWN" ? ti("expiryUnknown") : fmtDay(l.batch?.expiryDate)}</Td>
            <Td label={t("stockType")}>{ti(l.stockType)}</Td>
            <Td label={t("qty")} numeric>{fmtInt(l.qty)}</Td>
            {showCosts && (
              <>
                <Td label={t("costUnit")} numeric>
                  <span data-testid="line-cost">{l.unitCostVnd != null ? `${fmtInt(l.unitCostVnd)} VND` : l.unitCostMmk != null ? `${fmtInt(l.unitCostMmk)} MMK` : "—"}</span>
                </Td>
                <Td label={t("costRate")} numeric>
                  {l.rate ? <>{l.rate.mmkPerVnd.toString()}<span className="block text-xs text-muted-foreground">{fmtDay(l.rate.effectiveAt)}</span></> : "—"}
                </Td>
                <Td label={t("costInbound")} numeric>
                  {l.landedCostVnd != null ? fmtInt(l.landedCostVnd) : doc.shipment ? <span className="text-xs text-muted-foreground">{t("costViaShipment")}</span> : "—"}
                </Td>
              </>
            )}
          </tr>
        ))}
      </DataTable>

      {preview && (
        <Section title={t("previewTitle")} testId="post-preview">
          <p className="text-sm text-muted-foreground">{t("previewDraftNote")}</p>
          <p className="text-sm font-medium" data-testid="preview-summary">
            {t("previewSummary", { lines: preview.lineCount, inc: fmtInt(preview.increase), dec: fmtInt(preview.decrease) })}
          </p>
          {preview.short.length > 0 && <Notice tone="danger" data-testid="preview-short">{t("previewShort", { count: preview.short.length })}</Notice>}
          <DataTable stack numeric={[3, 4, 5]} empty={t("previewEmpty")} head={[t("variant"), t("previewLocation"), t("previewBefore"), t("previewDelta"), t("previewAfter")]}>
            {preview.effects.map((e) => (
              <tr key={`${e.locationId}|${e.variantId}|${e.stockType}`} data-testid="preview-row">
                <Td className="text-xs">
                  {variantLabel.get(e.variantId) ?? e.variantId}
                  <span className="block text-muted-foreground">{ti(e.stockType)}</span>
                </Td>
                <Td label={t("previewLocation")} className="font-mono text-xs">{locationName.get(e.locationId) ?? e.locationId}</Td>
                <Td label={t("previewBefore")} numeric>{fmtInt(e.before)}</Td>
                <Td label={t("previewDelta")} numeric className={e.delta < 0 ? "text-destructive" : "text-success"}>{e.delta > 0 ? "+" : ""}{fmtInt(e.delta)}</Td>
                <Td label={t("previewAfter")} numeric className={cn("font-medium", e.after < 0 && "text-destructive")}>{fmtInt(e.after)}</Td>
              </tr>
            ))}
          </DataTable>
          <p className="text-xs text-muted-foreground">{t("previewHelp")}</p>
        </Section>
      )}

      {doc.status === "DRAFT" ? (
        <div className="flex flex-wrap gap-3">
          {doc.type === "RECEIVE" && can(user.role, "stock:receive") && (
            <LinkButton href={`/admin/inventory/documents/${doc.id}/edit`}>{t("editDraft")}</LinkButton>
          )}
          {doc.type in REPLACE_PERMISSION && can(user.role, REPLACE_PERMISSION[doc.type as keyof typeof REPLACE_PERMISSION]) && (
            <LinkButton href={`/admin/inventory/documents/new?type=${doc.type}&from=${doc.id}`} icon="edit">
              {t("replaceDraft")}
            </LinkButton>
          )}
          <ActionButton
            action={postDocumentAction}
            fields={{ id: doc.id }}
            label={t("post")}
            confirm={preview ? t("postConfirmSummary", { code: doc.code, lines: preview.lineCount, inc: fmtInt(preview.increase), dec: fmtInt(preview.decrease) }) : t("postConfirm", { code: doc.code })}
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
        <p className="text-sm text-muted-foreground">{doc.status === "CANCELLED" ? t("cancelledNote") : t(doc.type === "RECEIVE" ? "postedNoteReceive" : "postedNote")}</p>
      )}
    </Page>
  );
}
