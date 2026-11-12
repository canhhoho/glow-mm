import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Copy, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePagePermission } from "@/server/auth/session";
import { can } from "@/server/auth/roles";
import { deriveLabel } from "@/server/catalog/approval-rules";
import type { ChangeItem } from "@/server/catalog/change-summary";
import { changeItemText } from "@/components/admin/change-text";
import { productEditView, productReadinessView } from "@/server/catalog/review";
import { getProductForEdit, getProductImages, productFormOptions } from "@/server/catalog/admin-queries";
import { discardChangesAction, reviewProductsAction, submitProductsAction, saveProductPreorderAction, deleteProductImageAction, reorderProductImageAction, saveProductPricingAction, setProductPublishedAction, updateProductImageAltAction } from "@/server/catalog/actions";
import { loadProductPricing, type PriceSource } from "@/server/catalog/product-pricing";
import { loadReadiness } from "@/server/catalog/readiness";
import { productSteps, type Issue, type ProductStep } from "@/server/catalog/readiness-rules";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm } from "@/components/admin/action-form";
import { ProductForm } from "@/components/admin/product-form";
import { ProductImageUpload } from "@/components/admin/product-images";
import { ProductStepsBar, StepTitle } from "@/components/admin/product-steps";
import { Badge, DataTable, EmptyState, fieldClass, fieldLabelClass, focusRing, LinkButton, Notice, Page, Section, Td } from "@/components/admin/ui";
import { fmtDateTime, fmtDay, fmtInt } from "@/lib/format";
import { localizedPath } from "@/lib/site";
import { prisma } from "@/lib/db";
import { getNumberSetting } from "@/server/settings";
import { salesBlockDays } from "@/server/inventory/documents";
import { availableToSell } from "@/server/orders/availability";
import { productStockRows } from "@/server/inventory/overview";
import { adjacentProducts } from "@/server/catalog/product-list";
import { ExpiryTag } from "@/components/admin/stock-parts";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PRODUCT_LABEL_TONE, changeTone } from "@/components/admin/status-tones";

/**
 * Trang SP theo quy trình 5 bước (docs/ke-hoach-quy-trinh-san-pham.md): thanh bước ở đầu, mỗi bước một khối.
 * 1 Thông tin & nội dung (ảnh + form sửa) · 2 Nhập kho + giá vốn · 3 Giá bán · 4 Duyệt (hiện = kiểm tra mở bán D2) · 5 Đăng bán.
 */

export default async function EditProductPage({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  const user = await requirePagePermission("catalog:manage");
  const [{ id }, { saved, created }] = await Promise.all([params, searchParams]);
  const [t, td, product, images] = await Promise.all([
    getTranslations("Products"),
    getTranslations("Docs"),
    getProductForEdit(id),
    getProductImages(id),
  ]);
  if (!product) notFound();
  // Gợi ý thương hiệu luôn gồm thương hiệu của SP này (kể cả khi chỉ còn SP ngừng kinh doanh).
  const options = await productFormOptions(product.brandId);
  // QT2: trạng thái duyệt (bước 4) + người duyệt.
  const approval = await prisma.product.findUniqueOrThrow({
    where: { id: product.id },
    select: {
      approvedAt: true,
      approvedById: true,
      archivedAt: true,
      published: true,
      approvalStatus: true,
      approvalVersion: true,
      rejectionReason: true,
      firstPublishedAt: true,
      updatedAt: true,
      preorderEnabled: true,
      variants: { select: { id: true, preorderLimit: true } },
    },
  });
  // QT3: đặt trước — hạn mức riêng / mặc định + số đang chờ hàng theo biến thể.
  const [preorderDefault, preorderWaiting] = await Promise.all([
    getNumberSetting("preorder.defaultLimit"),
    prisma.orderItem.groupBy({ by: ["variantId"], where: { variantId: { in: product.variants.map((v) => v.id) }, order: { status: "AWAITING_STOCK" } }, _sum: { qty: true } }),
  ]);
  const preorderLimit = new Map(approval.variants.map((v) => [v.id, v.preorderLimit]));
  const waitingQty = new Map(preorderWaiting.map((w) => [w.variantId, w._sum.qty ?? 0]));
  const approver = approval.approvedById ? await prisma.user.findUnique({ where: { id: approval.approvedById }, select: { name: true } }) : null;
  // P1-A: SP có bản đang sửa → form + kiểm tra mở bán theo bản sẽ được duyệt; khách vẫn thấy bản live.
  const view = (await productEditView(product.id))!;
  const cr = view.changeRequest;
  const lab = deriveLabel({ ...approval, hasChanges: !!cr });
  const readiness = cr
    ? await productReadinessView(product.id)
    : (await loadReadiness(prisma, [product.id])).get(product.id) ?? { errors: [], warnings: [], notReceivedSkus: [] };
  const canManage = can(user.role, "catalog:manage");
  const canApprove = can(user.role, "catalog:approve");
  const canPublish = can(user.role, "catalog:publish");
  const pendingReview = approval.approvalStatus === "PENDING";
  const canSubmit = canManage && !approval.archivedAt && !pendingReview && (!approval.approvedAt || !!cr) && readiness.errors.length === 0;
  const versionItems = JSON.stringify([{ id: product.id, version: approval.approvalVersion }]);
  const changeText = (c: ChangeItem) => changeItemText(t as Parameters<typeof changeItemText>[0], c);
  const pricingMode = options.warehouses.find((w) => w.id === product.stockLocationId)?.pricingMode ?? null;
  const stockNow = new Date();
  const [pricing, stock, ti, adjacent] = await Promise.all([
    loadProductPricing(product.variants.map((v) => v.id), pricingMode),
    productStockRows(product.id, stockNow),
    getTranslations("Inventory"),
    adjacentProducts(product.id),
  ]);
  const sourceText = (s: PriceSource | undefined) =>
    !s || s.kind === "none"
      ? t("priceBlock.sourceNone")
      : s.kind === "run"
        ? <a href={`/admin/pricing/runs/${s.runId}`} className="text-primary underline">{t("priceBlock.sourceRun")} · {fmtDay(s.at)}</a>
        : s.kind === "import"
          ? `${t("priceBlock.sourceImport")} · ${fmtDay(s.at)}`
          : `${t("priceBlock.sourceManual")} · ${fmtDay(s.at)}${s.note ? ` — ${s.note}` : ""}`;
  const flow = productSteps({ published: product.published, notReceivedSkus: readiness.notReceivedSkus, approved: !!approval.approvedAt && !cr }, readiness);
  const step = (key: ProductStep) => flow.steps.find((s) => s.key === key)!;

  type Row = Issue & { tone: "danger" | "warning"; kind: string };
  const isError = (i: Issue) => readiness.errors.some((e) => e.code === i.code);
  const row = (i: Issue): Row => ({ ...i, tone: isError(i) ? "danger" : "warning", kind: t(isError(i) ? "readiness.error" : "readiness.warning") });
  const errors = readiness.errors.map(row);
  const warnings = readiness.warnings.map(row);
  const stepIssues = (key: ProductStep) => step(key).issues.map(row);
  const issueList = (list: Row[]) => (
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
  const publishState = step("publish").state;

  // P3 (thiết kế "Chi tiết sản phẩm"): số liệu phần đầu, ghi chú tiến độ, lịch sử giá + nhật ký.
  const active = product.variants.filter((v) => v.active);
  const avail = active.length ? await availableToSell(prisma, active.map((v) => v.id), { now: new Date(), blockDays: await salesBlockDays() }) : new Map<string, number>();
  const plain = active.filter((v) => !v.isBundle);
  const stockTotal = (plain.length ? plain : active).reduce((sum, v) => sum + Math.max(0, avail.get(v.id) ?? 0), 0);
  const prices = active.map((v) => v.priceMmk).filter((x) => x > 0);
  const priceText = prices.length ? (Math.min(...prices) === Math.max(...prices) ? fmtInt(prices[0]) : `${fmtInt(Math.min(...prices))} – ${fmtInt(Math.max(...prices))}`) : null;
  const brandName = options.brands.find((b) => b.id === product.brandId)?.name ?? view.draftBrandName ?? "—";
  const categoryName = options.categories.find((c) => c.id === product.categoryId)?.name ?? "—";
  const warehouseName = options.warehouses.find((w) => w.id === product.stockLocationId)?.name ?? "—";
  const reviewNote = lab.label === "PENDING" || lab.change === "PENDING" ? t("hero.notePending") : lab.label === "REJECTED" || lab.change === "REJECTED" ? t("hero.noteRejected") : approval.approvedAt && !cr ? t("hero.noteApproved") : t("hero.noteNotSubmitted");
  const notes: Partial<Record<ProductStep, string>> = {
    create: step("create").state === "todo" ? t("hero.noteCreateMissing") : t("hero.noteCreateOk"),
    stock: t("hero.noteStock", { n: fmtInt(stockTotal) }),
    price: priceText ? t("hero.notePrice", { price: priceText }) : t("hero.notePriceMissing"),
    review: reviewNote,
    publish: product.published ? t("hero.notePublished") : t("hero.noteNotPublished"),
  };
  const checks = (["create", "price", "stock"] as const).map((k) => ({ key: k, ok: step(k).state === "done" || step(k).state === "warn" }));
  const variantIds = product.variants.map((v) => v.id);
  const [priceHistory, activity] = await Promise.all([
    prisma.priceHistory.findMany({ where: { variantId: { in: variantIds } }, orderBy: { createdAt: "desc" }, take: 20, include: { variant: { select: { sku: true } } } }),
    prisma.auditLog.findMany({ where: { entityId: product.id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const actorIds = [...new Set([...priceHistory.map((h) => h.userId), ...activity.map((a) => a.userId)].filter((x): x is string => !!x))];
  const actors = new Map((await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const actionText = (a: string) => (t.has(`activity.${a.replaceAll(".", "_")}`) ? t(`activity.${a.replaceAll(".", "_")}`) : a);

  return (
    <Page>
      {created && <Notice tone="success">{t("created")}</Notice>}
      {saved && <Notice tone="success">{t("saved")}</Notice>}
      <div className="flex flex-col gap-5 rounded-xl border bg-card p-4 md:flex-row" data-testid="product-hero">
        <div className="w-full max-w-60 shrink-0 space-y-2 md:w-52 xl:w-60">
          <div className="relative aspect-square overflow-hidden rounded-xl border bg-muted">
            {images[0] && <Image src={images[0].url} alt={images[0].alt || product.en.name} fill sizes="240px" className="object-cover" priority />}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {images.slice(1, 4).map((img) => (
              <span key={img.id} className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
                <Image src={img.url} alt={img.alt || product.en.name} fill sizes="56px" className="object-cover" />
              </span>
            ))}
            <a href="#product-images" className="flex aspect-square items-center justify-center rounded-lg border border-dashed text-muted-foreground hover:bg-muted" aria-label={t("images")} title={t("images")}>
              <Plus className="size-4" aria-hidden />
            </a>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <h1 className="text-xl font-semibold break-words sm:text-2xl">{product.en.name || product.my.name || product.slug}</h1>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs">
                  SKU: {product.variants[0]?.sku ?? "—"}
                  {product.variants.length > 1 && ` · ${t("list.moreVariants", { n: product.variants.length - 1 })}`}
                </span>
                <Badge tone={PRODUCT_LABEL_TONE[lab.label]}>{t(`lifecycle.${lab.label}`)}</Badge>
                {lab.change && <Badge tone={changeTone(lab.change)}>{t(`change.${lab.change}`)}</Badge>}
              </div>
              <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span>{t("colBrand")}: <span className="text-foreground">{brandName}</span></span>
                <span aria-hidden>|</span>
                <span>{t("colCategory")}: <span className="text-foreground">{categoryName}</span></span>
                <span aria-hidden>|</span>
                <span>{t("warehouse")}: <span className="text-foreground">{warehouseName}</span></span>
                <span aria-hidden>|</span>
                <span>{t("list.colUpdated")}: <span className="text-foreground">{fmtDateTime(approval.updatedAt)}</span></span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <LinkButton href="/admin/products" icon="back" iconOnly>
                {td("back")}
              </LinkButton>
              <nav aria-label={t("hero.adjacent")} className="flex items-center gap-1">
                {(
                  [
                    ["prev", adjacent.prev, ChevronLeft],
                    ["next", adjacent.next, ChevronRight],
                  ] as const
                ).map(([k, target, Icon]) =>
                  target ? (
                    <Link key={k} href={`/admin/products/${target}`} className={buttonVariants({ variant: "outline", size: "icon-lg" })} aria-label={t(`hero.${k}`)} title={t(`hero.${k}`)}>
                      <Icon aria-hidden />
                    </Link>
                  ) : (
                    <span key={k} className={cn(buttonVariants({ variant: "outline", size: "icon-lg" }), "pointer-events-none opacity-40")} aria-hidden>
                      <Icon />
                    </span>
                  ),
                )}
              </nav>
              {product.published && (
                <a href={localizedPath("my", `/p/${product.slug}`)} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "lg" })}>
                  {t("block.viewAsCustomer")}
                </a>
              )}
              <Link href={`/admin/products/new?copyFrom=${product.id}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
                <Copy aria-hidden /> {t("list.duplicate")}
              </Link>
              <a href="#product-edit" className={buttonVariants({ size: "lg" })}>
                <Pencil aria-hidden /> {t("hero.edit")}
              </a>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <h2 className="mb-4 font-medium">{t("hero.progress")}</h2>
            <ProductStepsBar steps={flow.steps} current={flow.current} t={t} notes={notes} />
          </div>
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-3">
        <div className="min-w-0 space-y-5 xl:col-span-2">
          <nav aria-label={t("hero.sections")} className="sticky top-14 z-10 -mx-1 flex gap-1 overflow-x-auto bg-background/95 px-1 text-sm shadow-[inset_0_-1px_0_var(--color-border)] backdrop-blur">
            {[
              ["#step-create", t("hero.tabOverview")],
              ["#product-edit", t("hero.tabVariants", { n: product.variants.length })],
              ["#step-stock", t("hero.tabStock")],
              ["#step-price", t("hero.tabPrice")],
              ["#price-history", t("hero.tabPriceHistory")],
              ["#activity", t("hero.tabActivity")],
            ].map(([href, label]) => (
              <a key={href} href={href} className={cn(focusRing, "border-b-2 border-transparent px-3 py-2 whitespace-nowrap text-muted-foreground hover:border-primary/40 hover:text-foreground")}>
                {label}
              </a>
            ))}
          </nav>

      {/* ── Bước 1: thông tin & nội dung ── */}
      <Section id="step-create" className="scroll-mt-20" title={<StepTitle index={1} step={step("create")} t={t} />}>
        {stepIssues("create").length > 0 && issueList(stepIssues("create"))}
        <section id="product-images" aria-labelledby="product-images-title" className="scroll-mt-20 rounded-lg border p-4">
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
        {/* Form sửa đầy đủ: mở sẵn khi SP chưa đăng bán (đang thiết lập), đóng khi đã bán. key: nạp lại state sau khi lưu. */}
        <details id="product-edit" open={!product.published} className="scroll-mt-28 rounded-lg border p-4" data-testid="product-edit">
          <summary className="cursor-pointer font-medium">{t("block.editInfo")}</summary>
          <div className="mt-4">
            <ProductForm
              key={JSON.stringify(view.edit)}
              initial={view.edit}
              draftBrandName={view.draftBrandName}
              slugLocked={!!approval.firstPublishedAt}
              options={options}
              review={{ submit: canManage && !approval.archivedAt, approve: canApprove && !approval.archivedAt }}
            />
          </div>
        </details>
      </Section>

      {/* ── Bước 2: nhập kho + giá vốn ── */}
      <Section
        id="step-stock"
        className="scroll-mt-20"
        title={<StepTitle index={2} step={step("stock")} t={t} />}
        actions={
          <div className="flex flex-wrap gap-2">
            <LinkButton href={`/admin/inventory/documents/new?type=RECEIVE&product=${product.id}`} icon="new">
              {t("block.receive")}
            </LinkButton>
            <LinkButton href={`/admin/inventory?q=${encodeURIComponent(product.variants[0]?.sku ?? product.slug)}`}>{t("block.viewStock")}</LinkButton>
          </div>
        }
      >
        <p className="text-sm" data-testid="stock-received">
          {readiness.notReceivedSkus.length > 0 ? t("block.notReceived", { skus: readiness.notReceivedSkus.join(", ") }) : t("block.receivedAll")}
        </p>
        {stepIssues("stock").length > 0 && issueList(stepIssues("stock"))}
        {/* P3b: tồn chỉ để xem — cùng số liệu trang Tồn kho; nhập / điều chỉnh qua phiếu kho. */}
        {stock.rows.some((r) => r.cols || r.reserved > 0) ? (
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
        )}
      </Section>

      {/* ── Bước 3: giá bán — nơi duy nhất đặt giá ngoài bảng tính giá (QT1b) ── */}
      <Section
        id="step-price"
        className="scroll-mt-20"
        title={<StepTitle index={3} step={step("price")} t={t} />}
        actions={<LinkButton href={`/admin/pricing?tab=runs&productId=${product.id}`}>{t("priceBlock.calcThis")}</LinkButton>}
      >
        <DataTable stack head={[t("sku"), t("label"), t("price"), t("priceBlock.source"), t("priceBlock.lastCost"), t("weight")]} numeric={[2]}>
          {product.variants.map((v) => {
            const row = pricing.get(v.id);
            return (
              <tr key={v.id} data-testid="step-price-row">
                <Td className="text-xs break-all">
                  <span className="font-mono">{v.sku}</span>
                  {!v.active && <span className="ml-1 text-muted-foreground">({t("priceBlock.inactive")})</span>}
                </Td>
                <Td label={t("label")}>{v.label}</Td>
                <Td label={t("price")} className={v.priceMmk > 0 ? "text-right tabular-nums" : "text-right text-destructive tabular-nums"}>
                  {fmtInt(v.priceMmk)}
                  {cr?.prices[v.id] && (
                    <div className="text-xs text-muted-foreground" data-testid="pending-price">
                      {t("review.pendingPrice", { price: fmtInt(cr.prices[v.id].priceMmk) })}
                    </div>
                  )}
                </Td>
                <Td label={t("priceBlock.source")} className="text-xs">{sourceText(row?.source)}</Td>
                <Td label={t("priceBlock.lastCost")} className="text-xs tabular-nums">
                  {row?.cost ? (
                    <>
                      {fmtInt(row.cost.amount)} {row.cost.currency}
                      {row.cost.source && <div className="text-muted-foreground">{row.cost.source.documentCode}</div>}
                    </>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td label={t("weight")} className="text-xs tabular-nums">{v.weightGrams ? `${fmtInt(v.weightGrams)} g` : "—"}</Td>
              </tr>
            );
          })}
        </DataTable>
        {stepIssues("price").length > 0 && issueList(stepIssues("price"))}
        {can(user.role, "pricing:manage") && (
        <details className="rounded-lg border p-4" data-testid="price-manual">
          <summary className="cursor-pointer font-medium">{t("priceBlock.manual")}</summary>
          {/* ActionForm reset sau khi lưu → ô về giá trị mới (defaultValue của lần render sau revalidate). */}
          <div className="mt-3">
            <ActionForm action={saveProductPricingAction} submitLabel={t("priceBlock.save")} okText={t("priceBlock.saved")} className="space-y-3">
              <p className="text-xs text-muted-foreground">{t("priceBlock.manualHelp")}</p>
              <input type="hidden" name="productId" value={product.id} />
              {product.variants.map((v) => (
                <fieldset key={v.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
                  <legend className="px-1 text-sm">
                    {v.label} <span className="font-mono text-xs text-muted-foreground">{v.sku}</span>
                  </legend>
                  <input type="hidden" name="variantId" value={v.id} />
                  {/* P0-H2: giá lúc mở trang — đã đổi ở nơi khác (bảng tính giá, Giá bán) thì báo lỗi, không ghi đè. */}
                  <input type="hidden" name="expectedPriceMmk" value={cr?.prices[v.id]?.priceMmk ?? v.priceMmk} />
                  <label className={fieldLabelClass}>
                    <span className="text-muted-foreground">{t("price")}</span>
                    <input name="priceMmk" aria-label={`${t("price")} ${v.sku}`} type="number" required min={1} step={1} inputMode="numeric" defaultValue={(cr?.prices[v.id]?.priceMmk ?? v.priceMmk) || ""} className={fieldClass} />
                  </label>
                  <label className={fieldLabelClass}>
                    <span className="text-muted-foreground">{t("affiliateCommission")}</span>
                    <input name="affiliateCommissionMmk" aria-label={`${t("affiliateCommission")} ${v.sku}`} type="number" min={0} step={100} inputMode="numeric" defaultValue={v.affiliateCommissionMmk ?? ""} className={fieldClass} />
                    <span className="text-xs text-muted-foreground">{t("affiliateCommissionHint")}</span>
                  </label>
                </fieldset>
              ))}
              {pricingMode === "LOCAL_MMK" && (
                <label className={fieldLabelClass}>
                  <span className="text-muted-foreground">{t("fixedProfitMmk")}</span>
                  <input name="fixedProfitMmk" type="number" min={0} step={1} inputMode="numeric" defaultValue={product.fixedProfitMmk ?? ""} className={fieldClass} />
                  <span className="text-xs text-muted-foreground">{t("fixedProfitHint")}</span>
                </label>
              )}
              <label className={fieldLabelClass}>
                <span className="text-muted-foreground">{t("priceBlock.reason")}</span>
                <input name="reason" maxLength={200} className={fieldClass} />
              </label>
            </ActionForm>
          </div>
        </details>
        )}
      </Section>

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
        </div>

        <aside className="space-y-5 xl:sticky xl:top-16">
          <section className="space-y-3 rounded-xl border bg-card p-4" data-testid="publish-checklist">
            <h2 className="font-medium">{t("hero.checklist")}</h2>
            <ul className="divide-y text-sm">
              {checks.map((c) => (
                <li key={c.key} className="flex items-center gap-3 py-2.5">
                  <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-primary-foreground [&_svg]:size-3.5", c.ok ? "bg-success" : "bg-destructive")} aria-hidden>
                    {c.ok ? <Check /> : <TriangleAlert />}
                  </span>
                  <a href={`#step-${c.key}`} className="min-w-0 flex-1 hover:underline">
                    <span className="block font-medium">{t(`hero.check.${c.key}`)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {c.key === "stock" ? t("hero.checkStockHint", { n: fmtInt(stockTotal) }) : t(`hero.check.${c.key}Hint`)}
                    </span>
                  </a>
                  <Badge tone={c.ok ? "success" : "danger"}>{t(c.ok ? "hero.pass" : "hero.fail")}</Badge>
                </li>
              ))}
            </ul>
          </section>

      {/* ── Bước 4: duyệt (QT2) — checklist mở bán + nút Duyệt có lưu vết; sửa nội dung/giá/ảnh sau khi duyệt → cần duyệt lại ── */}
      <Section id="step-review" className="scroll-mt-20" title={<StepTitle index={4} step={step("review")} t={t} />} testId="launch-check">
        <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="approval-status" data-label={lab.label} data-change={lab.change ?? ""}>
          <Badge tone={PRODUCT_LABEL_TONE[lab.label]}>{t(`lifecycle.${lab.label}`)}</Badge>
          {lab.change && <Badge tone={changeTone(lab.change)}>{t(`change.${lab.change}`)}</Badge>}
          {approval.approvedAt && (
            <span className="text-xs text-muted-foreground">
              <Check className="mr-1 inline size-3.5 text-success" aria-hidden />{approver ? t("approval.approvedBy", { name: approver.name, at: fmtDateTime(approval.approvedAt) }) : t("approval.approvedSystem")}
            </span>
          )}
        </div>
        {approval.approvalStatus === "REJECTED" && approval.rejectionReason && (
          <Notice tone="danger" data-testid="rejection-reason">{t("review.rejected", { reason: approval.rejectionReason })}</Notice>
        )}
        {view.changes && view.changes.length > 0 && (
          <div className="space-y-1 rounded-lg border p-3 text-sm" data-testid="change-summary">
            <p className="font-medium">{t("review.changesTitle")}</p>
            <ul className="list-disc pl-5">
              {view.changes.map((c, i) => (
                <li key={i}>{changeText(c)}</li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">{t("review.liveNote")}</p>
          </div>
        )}
        <div className="flex flex-wrap items-start gap-2" data-testid="review-actions">
          {canSubmit && <ActionButton action={submitProductsAction} fields={{ ids: product.id }} label={t("review.submit")} iconOnly={false} />}
          {pendingReview && canApprove && (
            <>
              {approval.approvedAt ? (
                <ActionButton action={reviewProductsAction} fields={{ decision: "approve", items: versionItems }} label={t("review.approveChanges")} confirm={t("review.approveConfirm")} iconOnly={false} />
              ) : (
                <>
                  {canPublish && (
                    <ActionButton action={reviewProductsAction} fields={{ decision: "approvePublish", items: versionItems }} label={t("review.approvePublish")} confirm={t("review.approveConfirm")} iconOnly={false} />
                  )}
                  <ActionButton action={reviewProductsAction} fields={{ decision: "approve", items: versionItems }} label={t("review.approveOnly")} confirm={t("review.approveConfirm")} variant="outline" iconOnly={false} />
                </>
              )}
              <ActionForm action={reviewProductsAction} submitLabel={t("review.reject")} variant="outline" className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="decision" value="reject" />
                <input type="hidden" name="items" value={versionItems} />
                <label className={fieldLabelClass}>
                  <span className="text-muted-foreground">{t("review.rejectReason")}</span>
                  <input name="reason" required minLength={5} maxLength={500} className={fieldClass} />
                </label>
              </ActionForm>
            </>
          )}
          {cr && canManage && (
            <ActionButton action={discardChangesAction} fields={{ id: product.id }} label={t("review.discard")} confirm={t("review.discardConfirm")} variant="outline" iconOnly={false} />
          )}
        </div>
        <p className="text-sm">
          {readiness.errors.length > 0
            ? t(product.published ? "readiness.publishedWithErrors" : "readiness.blockedHint", { count: readiness.errors.length })
            : t(product.published ? "readiness.publishedOk" : "readiness.readyHint")}
        </p>
        {errors.length > 0 && issueList(errors)}
        {/* Lưu ý không chặn mở bán: gom lại, mở khi cần. */}
        {warnings.length > 0 && (
          <details data-testid="readiness-warnings">
            <summary className="cursor-pointer text-sm text-muted-foreground">{t("readiness.warningsCount", { count: warnings.length })}</summary>
            <div className="mt-2">{issueList(warnings)}</div>
          </details>
        )}
        {errors.length + warnings.length === 0 && <Badge tone="success"><Check className="mr-1 size-3" aria-hidden />{t("readiness.allGood")}</Badge>}
        <p className="text-xs text-muted-foreground">{t("approval.help")}</p>
      </Section>

      {/* ── Bước 5: đăng bán ── */}
      <Section id="step-publish" className="scroll-mt-20" title={<StepTitle index={5} step={step("publish")} t={t} />} testId="step-publish-block">
        <p className="text-sm">{product.published ? t("block.published") : publishState === "waiting" ? t("block.publishWaiting") : t("block.hidden")}</p>
        {canPublish && (product.published || publishState === "todo") && (
          <ActionButton
            action={setProductPublishedAction}
            fields={{ id: product.id, published: product.published ? "0" : "1" }}
            label={product.published ? t("block.publishOff") : t("block.publishOn")}
            variant={product.published ? "outline" : "default"}
            iconOnly={false}
          />
        )}
        {/* QT3: hết hàng → nhận đặt trước (mặc định bật); combo không đặt trước. */}
        <details className="rounded-lg border p-4" data-testid="preorder-settings">
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
      </Section>
        </aside>
      </div>
    </Page>
  );
}
