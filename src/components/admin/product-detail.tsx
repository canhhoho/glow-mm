import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { fmtDateTime, fmtDay, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { getProductForEdit, getProductImages } from "@/server/catalog/admin-queries";
import type { productEditView } from "@/server/catalog/review";
import type { loadProductPricing, PriceSource } from "@/server/catalog/product-pricing";
import type { Issue } from "@/server/catalog/readiness-rules";
import type { productStockRows } from "@/server/inventory/overview";
import { deleteProductImageAction, reorderProductImageAction, saveProductPreorderAction, updateProductImageAltAction } from "@/server/catalog/actions";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm } from "@/components/admin/action-form";
import { ProductImageUpload } from "@/components/admin/product-images";
import { ExpiryTag } from "@/components/admin/stock-parts";
import { Badge, DataTable, EmptyState, fieldClass, fieldLabelClass, Section, Td } from "@/components/admin/ui";

/**
 * Các khối của trang Chi tiết sản phẩm (`admin/(panel)/products/[id]/page.tsx`), tách ra cho trang chính chỉ còn phần
 * đầu trang, tab và bố cục (design-system P3, 26/11/2026). Chỉ hiển thị — thao tác gọi action sẵn có, không thêm nghiệp vụ.
 */
type Product = NonNullable<Awaited<ReturnType<typeof getProductForEdit>>>;
type Images = Awaited<ReturnType<typeof getProductImages>>;
type ChangeRequest = NonNullable<Awaited<ReturnType<typeof productEditView>>>["changeRequest"];

/** Một dòng "còn thiếu / lưu ý" của điều kiện mở bán. */
export type IssueRow = Issue & { tone: "danger" | "warning"; kind: string };

export async function IssueList({ rows: list }: { rows: IssueRow[] }) {
  const t = await getTranslations("Products");
  return (
    <ul className="space-y-1.5 text-sm">
  {list.map((i) => (
    <li key={i.code} className="flex flex-wrap items-start gap-2" data-testid={`issue-${i.code}`}>
      <Badge tone={i.tone}>{i.kind}</Badge>
      <span>
        {t(`readiness.issue.${i.code}`)}
        {i.skus?.length ? <span className="font-mono text-xs text-muted-foreground"> · {i.skus.join(", ")}</span> : null}
      </span>
    </li>
  ))}
</ul>
  );
}

/** Ảnh sản phẩm: tải lên, chú thích, đổi thứ tự, xoá (tab Thông tin). */
export async function ProductImages({ product, images, cr }: { product: Product; images: Images; cr: ChangeRequest }) {
  const t = await getTranslations("Products");
  return (
    <section id="product-images" aria-labelledby="product-images-title" className="scroll-mt-20 rounded-xl border p-4">
  <h3 id="product-images-title" className="mb-3 font-medium">
    {t("images")}
  </h3>
  <ProductImageUpload productId={product.id} />
  {cr && (cr.images.add.length > 0 || cr.images.remove.length > 0) && (
    <p className="mt-3 rounded-md bg-muted p-2 text-sm" data-testid="images-staged">
      {t("review.imagesStaged", { add: cr.images.add.length, remove: cr.images.remove.length })}
    </p>
  )}
  {images.length === 0 ? (
    <p className="mt-3 text-sm text-muted-foreground">{t("imagesEmpty")}</p>
  ) : (
    <ul className="mt-4 space-y-3">
      {images.map((img, i) => (
        <li key={img.id} data-testid="product-image" className="flex flex-wrap items-start gap-3 rounded-lg border p-2">
          <div className="relative size-24 shrink-0 overflow-hidden rounded-md bg-muted">
            <Image src={img.url} alt={img.alt || product.en.name} fill sizes="96px" className="object-cover" />
          </div>
          <div className="min-w-48 flex-1 space-y-2">
            {i === 0 && <Badge tone="brand">{t("imagesCover")}</Badge>}
            <ActionForm
              action={updateProductImageAltAction}
              submitLabel={t("imagesSaveAlt")}
              okText={t("saved")}
              variant="outline"
              className="flex flex-wrap items-end gap-2"
            >
              <input type="hidden" name="imageId" value={img.id} />
              <label className={fieldLabelClass}>
                <span className="text-muted-foreground">{t("imagesAlt")}</span>
                <input name="alt" defaultValue={img.alt} maxLength={200} className={fieldClass} />
              </label>
            </ActionForm>
          </div>
          <div className="flex flex-wrap gap-2">
            {i > 0 && (
              <ActionButton action={reorderProductImageAction} fields={{ imageId: img.id, direction: "up" }} label={t("imagesUp")} icon={<ArrowUp aria-hidden />} iconOnly={false} variant="outline" />
            )}
            {i < images.length - 1 && (
              <ActionButton action={reorderProductImageAction} fields={{ imageId: img.id, direction: "down" }} label={t("imagesDown")} icon={<ArrowDown aria-hidden />} iconOnly={false} variant="outline" />
            )}
            <ActionButton
              action={deleteProductImageAction}
              fields={{ imageId: img.id }}
              label={t("imagesDelete")}
              variant="destructive"
              confirm={t("imagesDeleteConfirm")}
              iconOnly={true}
              icon={<Trash2 aria-hidden className="size-4 shrink-0" />}
            />
          </div>
        </li>
      ))}
    </ul>
  )}
</section>
  );
}

/** Đặt trước khi hết hàng: bật/tắt + hạn mức theo biến thể (tab Tồn & nhập hàng). */
export async function ProductPreorderSettings({
  product,
  approval,
  preorderDefault,
  preorderLimit,
  waitingQty,
}: {
  product: Product;
  approval: { preorderEnabled: boolean };
  preorderDefault: number;
  preorderLimit: Map<string, number | null>;
  waitingQty: Map<string, number>;
}) {
  const t = await getTranslations("Products");
  return (
    <details className="rounded-xl border p-4" data-testid="preorder-settings">
  <summary className="cursor-pointer font-medium">
    {t("preorder.title")} · {approval.preorderEnabled ? t("preorder.on") : t("preorder.off")}
  </summary>
  <div className="mt-3">
    <ActionForm action={saveProductPreorderAction} submitLabel={t("preorder.save")} okText={t("preorder.saved")} className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("preorder.help", { n: preorderDefault })}</p>
      <input type="hidden" name="productId" value={product.id} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="preorderEnabled" defaultChecked={approval.preorderEnabled} className="size-4 accent-primary" />
        {t("preorder.enabled")}
      </label>
      {product.variants
        .filter((v) => !v.isBundle)
        .map((v) => (
          <div key={v.id} className="grid gap-1 sm:grid-cols-[1fr_10rem] sm:items-end">
            <input type="hidden" name="variantId" value={v.id} />
            <span className="text-sm">
              {v.label} <span className="font-mono text-xs text-muted-foreground">{v.sku}</span>
              <span className="block text-xs text-muted-foreground">{t("preorder.waiting", { n: waitingQty.get(v.id) ?? 0 })}</span>
            </span>
            <label className={fieldLabelClass}>
              <span className="text-muted-foreground">{t("preorder.limit")}</span>
              <input
                name="preorderLimit"
                aria-label={`${t("preorder.limit")} ${v.sku}`}
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                placeholder={String(preorderDefault)}
                defaultValue={preorderLimit.get(v.id) ?? ""}
                className={fieldClass}
              />
            </label>
          </div>
        ))}
    </ActionForm>
  </div>
</details>
  );
}

/** Tồn theo biến thể — chỉ để xem, cùng số liệu trang Tồn kho (tab Tồn & nhập hàng). */
export async function ProductStockTable({ stock, stockNow }: { stock: NonNullable<Awaited<ReturnType<typeof productStockRows>>>; stockNow: Date }) {
  const ti = await getTranslations("Inventory");
  return (
    stock.rows.some((r) => r.cols || r.reserved > 0) ? (
  <DataTable dense numeric={[1, 2, 3]} head={[ti("colSku"), ti("colPhysical"), ti("colReserved"), ti("colAvailable"), ti("colEarliest")]}>
    {stock.rows.map((r) => (
      <tr key={r.variantId} data-testid="product-stock-row">
        <Td>
          <span className="font-mono text-xs">{r.sku}</span> <span className="text-xs text-muted-foreground">{r.label}</span>
        </Td>
        <Td className="text-right tabular-nums">{r.cols ? fmtInt(r.cols.vn + r.cols.inbound + r.cols.mm + r.cols.tester) : "—"}</Td>
        <Td className="text-right tabular-nums text-muted-foreground">{fmtInt(r.reserved)}</Td>
        <Td className={cn("text-right font-medium tabular-nums", r.available === 0 && "text-destructive")}>{fmtInt(r.available)}</Td>
        <Td>
          {r.cols?.earliest ? <ExpiryTag date={r.cols.earliest.expiryDate} now={stockNow} t={ti} th={stock.thresholds} /> : <span className="text-muted-foreground">—</span>}
        </Td>
      </tr>
    ))}
  </DataTable>
) : (
  <EmptyState>{ti("empty")}</EmptyState>
)
  );
}

/** Bảng giá từng SKU: giá đang bán, giá chờ duyệt, nguồn giá, giá mua gần nhất (tab Giá bán). */
export async function ProductPriceTable({ product, pricing, cr }: { product: Product; pricing: Awaited<ReturnType<typeof loadProductPricing>>; cr: ChangeRequest }) {
  const [t, tf] = await Promise.all([getTranslations("Products"), getTranslations("ProductFields")]);
  const sourceText = (s: PriceSource | undefined) =>
    !s || s.kind === "none"
      ? t("priceBlock.sourceNone")
      : s.kind === "run"
        ? <a href={`/admin/pricing/runs/${s.runId}`} className="text-primary underline">{t("priceBlock.sourceRun")} · {fmtDay(s.at)}</a>
        : s.kind === "import"
          ? `${t("priceBlock.sourceImport")} · ${fmtDay(s.at)}`
          : `${t("priceBlock.sourceManual")} · ${fmtDay(s.at)}${s.note ? ` — ${s.note}` : ""}`;
  return (
    <DataTable stack head={[tf("sku.label"), tf("variant_label.label"), t("price"), t("priceBlock.source"), t("priceBlock.lastCost"), tf("weight_g.label")]} numeric={[2]}>
  {product.variants.map((v) => {
    const row = pricing.get(v.id);
    return (
      <tr key={v.id} data-testid="step-price-row">
        <Td className="text-xs whitespace-nowrap">
          <span className="font-mono">{v.sku}</span>
          {!v.active && <span className="ml-1 text-muted-foreground">({t("priceBlock.inactive")})</span>}
        </Td>
        <Td label={tf("variant_label.label")}>{v.label}</Td>
        <Td label={t("price")} className={v.priceMmk > 0 ? "text-right tabular-nums" : "text-right text-destructive tabular-nums"}>
          <span data-testid="step-price-value">{fmtInt(v.priceMmk)}</span>
          {cr?.prices[v.id] && (
            <div className="text-xs text-muted-foreground" data-testid="pending-price">
              {t("review.pendingPrice", { price: fmtInt(cr.prices[v.id].priceMmk) })}
            </div>
          )}
          {(v.affiliateCommissionMmk != null || cr?.prices[v.id]?.commission) && (
            <div className="text-xs text-muted-foreground" data-testid="step-commission">
              {t("priceBlock.commission", { value: v.affiliateCommissionMmk == null ? "%" : fmtInt(v.affiliateCommissionMmk) })}
              {cr?.prices[v.id]?.commission && (
                <span className="text-warning"> → {cr.prices[v.id].commission!.value == null ? "%" : fmtInt(cr.prices[v.id].commission!.value)}</span>
              )}
            </div>
          )}
        </Td>
        <Td label={t("priceBlock.source")} className="text-xs">{sourceText(row?.source)}</Td>
        <Td label={t("priceBlock.lastCost")} className="text-xs tabular-nums">
          {row?.cost ? (
            <>
              {fmtInt(row.cost.amount)} {row.cost.currency}
              {row.cost.source ? <div className="text-muted-foreground">{row.cost.source.documentCode}</div> : row.cost.purchase && <div className="text-muted-foreground">{t("priceBlock.currentPurchase")}</div>}
            </>
          ) : (
            "—"
          )}
          {row?.draft && (
            <div className="text-warning-foreground" data-testid="price-draft-receipt">
              <Link href={`/admin/inventory/documents/${row.draft.documentId}`} className="underline">{t("priceBlock.draftReceipt", { code: row.draft.code })}</Link>
            </div>
          )}
        </Td>
        <Td label={tf("weight_g.label")} className="text-xs tabular-nums">{v.weightGrams ? `${fmtInt(v.weightGrams)} g` : "—"}</Td>
      </tr>
    );
  })}
</DataTable>
  );
}

/** Tab Lịch sử: lịch sử giá + nhật ký thao tác (chỉ tải khi mở tab). */
export async function ProductHistory({ productId, variantIds }: { productId: string; variantIds: string[] }) {
  const [t, priceHistory, activity] = await Promise.all([
    getTranslations("Products"),
    prisma.priceHistory.findMany({ where: { variantId: { in: variantIds } }, orderBy: { createdAt: "desc" }, take: 20, include: { variant: { select: { sku: true } } } }),
    prisma.auditLog.findMany({ where: { entityId: productId }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const actorIds = [...new Set([...priceHistory.map((h) => h.userId), ...activity.map((a) => a.userId)].filter((x): x is string => !!x))];
  const actors = new Map((actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]));
  const actionText = (a: string) => (t.has(`activity.${a.replaceAll(".", "_")}`) ? t(`activity.${a.replaceAll(".", "_")}`) : a);
  return (
    <>
    <Section id="price-history" className="scroll-mt-28" title={t("hero.tabPriceHistory")}>
  <DataTable stack dense empty={t("hero.noPriceHistory")} head={[t("list.colUpdated"), t("sku"), t("hero.priceChange"), t("hero.priceReason"), t("hero.by")]} numeric={[2]}>
    {priceHistory.map((h) => (
      <tr key={h.id}>
        <Td className="whitespace-nowrap tabular-nums">{fmtDateTime(h.createdAt)}</Td>
        <Td label={t("sku")} className="font-mono">{h.variant.sku}</Td>
        <Td label={t("hero.priceChange")} className="text-right whitespace-nowrap tabular-nums">{fmtInt(h.oldPriceMmk)} → {fmtInt(h.newPriceMmk)}</Td>
        <Td label={t("hero.priceReason")}>{h.runId ? t("priceBlock.sourceRun") : (h.reason ?? "—")}</Td>
        <Td label={t("hero.by")}>{actors.get(h.userId) ?? "—"}</Td>
      </tr>
    ))}
  </DataTable>
</Section>

<Section id="activity" className="scroll-mt-28" title={t("hero.tabActivity")}>
  {activity.length === 0 ? (
    <p className="text-sm text-muted-foreground">{t("hero.noActivity")}</p>
  ) : (
    <ol className="space-y-2 text-sm" data-testid="product-activity">
      {activity.map((a) => (
        <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 border-b pb-2 last:border-0">
          <span className="text-xs text-muted-foreground tabular-nums">{fmtDateTime(a.createdAt)}</span>
          <span className="font-medium">{actionText(a.action)}</span>
          <span className="text-xs text-muted-foreground">{a.userId ? (actors.get(a.userId) ?? "—") : t("hero.system")}</span>
        </li>
      ))}
    </ol>
  )}
</Section>
    </>
  );
}
