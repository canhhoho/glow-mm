import type { ReactNode } from "react";
import { focusQuery } from "@/lib/price-focus";
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
import { isStandardVariantLabel, variantDisplayName } from "@/lib/variant-label";

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
  const variantLabel = new Map(doc.lines.map((l) => [l.variantId, `${l.variant.sku} · ${variantDisplayName(productName(l.variant.product.translations, l.variant.product.slug), l.variant.label)}`]));
  // Giá mua / tỷ giá / phí về kho của từng lần nhập: chỉ người có quyền xem giá (cùng quyền đặt giá).
  const showCosts = doc.type === "RECEIVE" && can(user.role, "pricing:manage");
  const picked = doc.status === "DRAFT" && ["ISSUE", "TRANSFER"].includes(doc.type) && doc.fromId ? await prisma.orderPickLine.findMany({ where: { locationId: doc.fromId, variantId: { in: doc.lines.map(l=>l.variantId) }, pick: { consumedAt: null, order: { status: { in: ["COD_CONFIRMED", "PAYMENT_CONFIRMED"] } } } }, select: { pick: { select: { order: { select: { code: true } } } } }, take: 50 }) : [];

  // ── Phiếu NHẬP: một bảng. Mỗi dòng = SKU × loại tồn (gộp các lô); tồn hiện tại → dự kiến tính MỘT lần cho nhóm
  //    (xem trước cộng mọi lô của SKU tại kho nhập theo loại tồn) → nhiều lô cùng SKU không lặp / cộng sai số tồn.
  const receive = doc.type === "RECEIVE";
  const groups = new Map<string, { variant: (typeof doc.lines)[number]["variant"]; stockType: (typeof doc.lines)[number]["stockType"]; lines: typeof doc.lines }>();
  for (const l of receive ? doc.lines : []) {
    const key = `${l.variantId}|${l.stockType}`;
    const g = groups.get(key) ?? { variant: l.variant, stockType: l.stockType, lines: [] };
    g.lines.push(l);
    groups.set(key, g);
  }
  const stockTypes = [...new Set(doc.lines.map((l) => l.stockType))];
  const effect = new Map(preview?.effects.map((e) => [`${e.locationId}|${e.variantId}|${e.stockType}`, e]) ?? []);
  const expiryText = (b: (typeof doc.lines)[number]["batch"]) =>
    !b ? "—" : b.expiryStatus === "NONE" ? t("expiryShort.none") : b.expiryStatus === "DATED" && b.expiryDate ? fmtDay(b.expiryDate) : t("expiryShort.unknown");
  const needsExpiryLegend = doc.lines.some((l) => l.batch && (l.batch.expiryStatus !== "DATED" || !l.batch.expiryDate));
  const costText = (l: (typeof doc.lines)[number]) => (l.unitCostVnd != null ? `${fmtInt(l.unitCostVnd)} VND` : l.unitCostMmk != null ? `${fmtInt(l.unitCostMmk)} MMK` : "—");
  const receiveHead = [t("product"), t("lotNo"), t("expiry"), t("receiveQty"), ...(showCosts ? [t("costUnit")] : []), ...(preview ? [t("stockChange")] : [])];
  // Ô nhiều lô: mỗi lô một dòng cùng chiều cao để các cột thẳng hàng.
  const lotList = (items: ReactNode[], className?: string) => (
    <ul className={cn("space-y-1", className)}>{items.map((x, i) => <li key={i} className="min-h-5">{x}</li>)}</ul>
  );

  return (
    <Page>
      <PageHeader
        title={`${t(doc.type)} · ${doc.code}`}
        back={{ href: "/admin/inventory/documents", label: t("back") }}
        // "Tính giá SKU vừa nhập" → trang Giá bán thủ công cho đúng các SKU của phiếu (giá tự động đang tắt).
        actions={doc.type === "RECEIVE" && doc.status === "POSTED" && can(user.role, "pricing:manage") && <LinkButton href={`/admin/selling-prices?${focusQuery({ ids: doc.lines.map((l) => l.variantId) })}`}>{t("priceReceived")}</LinkButton>}
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
            <dt className="text-muted-foreground">{doc.type === "ADJUST" ? t("location") : receive ? t("receiveLocation") : t("to")}</dt>
            <dd className="font-mono text-xs">
              {doc.to.code} — {doc.to.name}
            </dd>
          </>
        )}
        {/* Phiếu nhập: loại tồn giống nhau ở mọi dòng → hiện chung ở đầu phiếu; có cả hàng bán và tester → nhãn từng dòng. */}
        {receive && stockTypes.length === 1 && (
          <>
            <dt className="text-muted-foreground">{t("stockType")}</dt>
            <dd data-testid="doc-stock-type">{ti(stockTypes[0])}</dd>
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

      {receive && (
        <DataTable
          stack
          numeric={receiveHead.map((_, i) => i).filter((i) => i >= 3)}
          empty={tc("noData")}
          head={receiveHead}
          tableClassName="md:table-fixed"
        >
          {[...groups.values()].map((g) => {
            const e = doc.toId ? effect.get(`${doc.toId}|${g.variant.id}|${g.stockType}`) : undefined;
            const label = g.variant.label && !isStandardVariantLabel(g.variant.label) ? g.variant.label : null;
            return (
              <tr key={`${g.variant.id}|${g.stockType}`} data-testid="receive-row">
                <Td className="md:w-[42%]">
                  <span className="block font-medium break-words">{productName(g.variant.product.translations, g.variant.product.slug)}</span>
                  <span className="block text-xs break-all text-muted-foreground">
                    <span className="font-mono">{g.variant.sku}</span>
                    {label && <> · {label}</>}
                  </span>
                  {stockTypes.length > 1 && (
                    <span className="mt-1 inline-block" data-testid="row-stock-type">
                      <Badge tone={g.stockType === "SELLABLE" ? "neutral" : "warning"}>{ti(g.stockType)}</Badge>
                    </span>
                  )}
                </Td>
                <Td label={t("lotNo")} className="font-mono text-xs break-all">{lotList(g.lines.map((l) => l.batch?.lotNo ?? "—"))}</Td>
                <Td label={t("expiry")} className="text-xs whitespace-nowrap">{lotList(g.lines.map((l) => expiryText(l.batch)))}</Td>
                <Td label={t("receiveQty")} numeric>{lotList(g.lines.map((l) => fmtInt(l.qty)))}</Td>
                {showCosts && (
                  <Td label={t("costUnit")} numeric className="whitespace-nowrap">
                    {lotList(g.lines.map((l) => <span key={l.id} data-testid="line-cost">{costText(l)}</span>))}
                  </Td>
                )}
                {/* Chỉ phiếu nháp: phiếu đã ghi sổ / huỷ không hiện "dự kiến" như thao tác chưa làm. */}
                {preview && (
                  <Td label={t("stockChange")} numeric className="whitespace-nowrap" >
                    {e ? (
                      <span data-testid="receive-stock">
                        {fmtInt(e.before)} → <span className={cn("font-medium", e.after < 0 && "text-destructive")}>{fmtInt(e.after)}</span>
                        <span className={cn("block text-xs", e.delta < 0 ? "text-destructive" : "text-success")}>{e.delta > 0 ? "+" : ""}{fmtInt(e.delta)}</span>
                      </span>
                    ) : "—"}
                  </Td>
                )}
              </tr>
            );
          })}
        </DataTable>
      )}

      {receive && (needsExpiryLegend || preview) && (
        <div className="space-y-2 text-sm" data-testid={preview ? "post-preview" : undefined}>
          {needsExpiryLegend && <p className="text-xs text-muted-foreground" data-testid="expiry-legend">{t("expiryLegend")}</p>}
          {preview && (
            <>
              <p className="font-medium" data-testid="preview-summary">
                {t("previewSummary", { lines: preview.lineCount, inc: fmtInt(preview.increase), dec: fmtInt(preview.decrease) })}
              </p>
              {preview.short.length > 0 && <Notice tone="danger" data-testid="preview-short">{t("previewShort", { count: preview.short.length })}</Notice>}
              <Notice tone="warning">{t("previewDraftNote")}</Notice>
              <p className="text-xs text-muted-foreground">
                {t("stockScope", { location: doc.to ? `${doc.to.code} — ${doc.to.name}` : "—" })} {t("previewHelp")}
              </p>
            </>
          )}
        </div>
      )}

      {!receive && (
      <DataTable
        stack
        numeric={showCosts ? [4, 5] : [4]}
        empty={tc("noData")}
        head={[t("variant"), t("lotNo"), t("expiry"), t("stockType"), t("qty"), ...(showCosts ? [t("costUnit")] : [])]}
      >
        {doc.lines.map((l) => (
          <tr key={l.id}>
            <Td>
              <span className="font-mono text-xs">{l.variant.sku}</span>{" "}
              {variantDisplayName(productName(l.variant.product.translations, l.variant.product.slug), l.variant.label)}
            </Td>
            <Td label={t("lotNo")} className="font-mono text-xs">{l.batch?.lotNo ?? t("autoFefo")}</Td>
            <Td label={t("expiry")}>{l.batch?.expiryStatus === "NONE" ? ti("expiryNone") : l.batch?.expiryStatus === "UNKNOWN" ? ti("expiryUnknown") : fmtDay(l.batch?.expiryDate)}</Td>
            <Td label={t("stockType")}>{ti(l.stockType)}</Td>
            <Td label={t("qty")} numeric>{fmtInt(l.qty)}</Td>
            {/* 16/11/2026: phiếu chỉ hiện giá mua — không có cột Tỷ giá / Phí về kho (tỷ giá chốt ngầm theo dòng khi ghi sổ). */}
            {showCosts && (
              <Td label={t("costUnit")} numeric>
                <span data-testid="line-cost">{l.unitCostVnd != null ? `${fmtInt(l.unitCostVnd)} VND` : l.unitCostMmk != null ? `${fmtInt(l.unitCostMmk)} MMK` : "—"}</span>
              </Td>
            )}
          </tr>
        ))}
      </DataTable>
      )}

      {!receive && preview && (
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
