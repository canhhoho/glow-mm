import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Copy, Pencil, Plus, Trash2 } from "lucide-react";
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
import { discardChangesAction, restoreProductAction, reviewProductsAction, submitProductsAction, saveProductPreorderAction, deleteProductImageAction, reorderProductImageAction, setProductPublishedAction, updateProductImageAltAction } from "@/server/catalog/actions";
import { productPrimaryAction } from "@/server/catalog/product-actions";
import { isSafeInternalPath } from "@/lib/safe-path";
import { loadProductPricing, type PriceSource } from "@/server/catalog/product-pricing";
import { loadReadiness } from "@/server/catalog/readiness";
import { productSteps, type Issue, type ProductStep } from "@/server/catalog/readiness-rules";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm } from "@/components/admin/action-form";
import { ProductForm } from "@/components/admin/product-form";
import { ProductImageUpload } from "@/components/admin/product-images";
import { ProductConditions, StepTitle } from "@/components/admin/product-steps";
import { Badge, DataTable, EmptyState, fieldClass, fieldLabelClass, LinkButton, Notice, Page, Section, TabNav, Td } from "@/components/admin/ui";
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
 * Trang SP: đầu trang (tên, SKU, kho, trạng thái, MỘT nút chính theo trạng thái/quyền) + 4 tab theo URL
 * (`?tab=info|stock|price|history`, chỉ tải dữ liệu của tab đang xem) + cột phải "điều kiện đăng bán" (đạt / còn thiếu,
 * dẫn tới nơi xử lý), khối Duyệt và khối Đăng bán. Nhập hàng và đặt giá là điều kiện song song, không phải bước nối tiếp.
 * Điều kiện dùng chung `productSteps` / readiness (docs/ke-hoach-quy-trinh-san-pham.md). SP ngừng kinh doanh: banner + Khôi phục,
 * không có lối tắt nhập hàng / đặt giá / đăng bán. `?from=` giữ danh sách (tab, bộ lọc) để nút Quay lại về đúng chỗ.
 */
const DETAIL_TABS = ["info", "stock", "price", "history"] as const;
type DetailTab = (typeof DETAIL_TABS)[number];

export default async function EditProductPage({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  const user = await requirePagePermission("catalog:manage");
  const [{ id }, { saved, created, tab: rawTab, from }] = await Promise.all([params, searchParams]);
  const tab: DetailTab = DETAIL_TABS.find((k) => k === rawTab) ?? "info";
  // Quay lại danh sách đúng tab/bộ lọc đã mở từ đó (chỉ nhận đường dẫn nội bộ /admin/…).
  const fromPath = typeof from === "string" && from.startsWith("/admin/") && isSafeInternalPath(from) ? from : undefined;
  const backHref = fromPath ?? "/admin/products";
  const tabHref = (k: DetailTab, hash = "") => {
    const qs = new URLSearchParams();
    if (k !== "info") qs.set("tab", k);
    if (fromPath) qs.set("from", fromPath);
    return `/admin/products/${id}${qs.size ? `?${qs}` : ""}${hash}`;
  };
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
  const archived = !!approval.archivedAt;
  const [pricing, stock, ti, adjacent] = await Promise.all([
    tab === "price" ? loadProductPricing(product.variants.map((v) => v.id), pricingMode) : null,
    tab === "stock" ? productStockRows(product.id, stockNow) : null,
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
  const range = (xs: number[]) => (Math.min(...xs) === Math.max(...xs) ? fmtInt(xs[0]) : `${fmtInt(Math.min(...xs))} – ${fmtInt(Math.max(...xs))}`);
  const priceText = prices.length ? range(prices) : null;
  // Giá đang chờ duyệt (khác giá đang bán) — ghi kèm để không nhầm là giá đã áp dụng.
  const pendingPrices = active.flatMap((v) => {
    const staged = cr?.prices[v.id]?.priceMmk;
    return staged != null && staged > 0 && staged !== v.priceMmk ? [staged] : [];
  });
  const brandName = options.brands.find((b) => b.id === product.brandId)?.name ?? view.draftBrandName ?? "—";
  const categoryName = options.categories.find((c) => c.id === product.categoryId)?.name ?? "—";
  const warehouseName = options.warehouses.find((w) => w.id === product.stockLocationId)?.name ?? "—";
  const reviewNote = lab.label === "PENDING" || lab.change === "PENDING" ? t("hero.notePending") : lab.label === "REJECTED" || lab.change === "REJECTED" ? t("hero.noteRejected") : approval.approvedAt && !cr ? t("hero.noteApproved") : t("hero.noteNotSubmitted");
  const notes: Partial<Record<ProductStep, string>> = {
    create: step("create").state === "todo" ? t("hero.noteCreateMissing") : t("hero.noteCreateOk"),
    stock: t("hero.noteStock", { n: fmtInt(stockTotal) }),
    price: [priceText ? t("hero.notePrice", { price: priceText }) : t("hero.notePriceMissing"), ...(pendingPrices.length ? [t("hero.notePricePending", { price: range(pendingPrices) })] : [])].join(" · "),
    review: reviewNote,
    publish: product.published ? t("hero.notePublished") : t("hero.noteNotPublished"),
  };
  const variantIds = product.variants.map((v) => v.id);
  // Lịch sử giá + nhật ký chỉ tải khi mở tab Lịch sử.
  const [priceHistory, activity] = tab === "history"
    ? await Promise.all([
        prisma.priceHistory.findMany({ where: { variantId: { in: variantIds } }, orderBy: { createdAt: "desc" }, take: 20, include: { variant: { select: { sku: true } } } }),
        prisma.auditLog.findMany({ where: { entityId: product.id }, orderBy: { createdAt: "desc" }, take: 20 }),
      ])
    : [[], []];
  const actorIds = [...new Set([...priceHistory.map((h) => h.userId), ...activity.map((a) => a.userId)].filter((x): x is string => !!x))];
  const actors = new Map((actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]));

  // Một nút chính theo trạng thái + quyền (đầu trang); các nút còn lại vẫn nằm trong khối Duyệt / Đăng bán.
  const primaryKind = productPrimaryAction({
    archived, published: product.published, pendingReview, approved: !!approval.approvedAt, hasChanges: !!cr,
    ready: readiness.errors.length === 0, canManage, canApprove, canPublish, canSubmit,
  });
  const primaryAction = (() => {
    switch (primaryKind) {
      case "restore":
        return <ActionButton action={restoreProductAction} fields={{ id: product.id }} label={t("restore")} iconOnly={false} />;
      case "approvePublish":
        return <ActionButton action={reviewProductsAction} fields={{ decision: "approvePublish", items: versionItems }} label={t("review.approvePublish")} confirm={t("review.approveConfirm")} iconOnly={false} />;
      case "approveChanges":
        return <ActionButton action={reviewProductsAction} fields={{ decision: "approve", items: versionItems }} label={t("review.approveChanges")} confirm={t("review.approveConfirm")} iconOnly={false} />;
      case "approveOnly":
        return <ActionButton action={reviewProductsAction} fields={{ decision: "approve", items: versionItems }} label={t("review.approveOnly")} confirm={t("review.approveConfirm")} iconOnly={false} />;
      case "submit":
        return <ActionButton action={submitProductsAction} fields={{ ids: product.id }} label={t("review.submit")} iconOnly={false} />;
      case "publish":
        return <ActionButton action={setProductPublishedAction} fields={{ id: product.id, published: "1" }} label={t("block.publishOn")} iconOnly={false} />;
      case "edit":
        return (
          <Link href={tabHref("info", "#product-edit")} className={buttonVariants({ size: "lg" })}>
            <Pencil aria-hidden /> {t("hero.edit")}
          </Link>
        );
      default:
        return null;
    }
  })();
  const tabLabel: Record<DetailTab, string> = { info: t("detailTab.info"), stock: t("detailTab.stock"), price: t("detailTab.price"), history: t("detailTab.history") };
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
              <LinkButton href={backHref} icon="back" iconOnly>
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
                    <Link key={k} href={`/admin/products/${target}${fromPath ? `?from=${encodeURIComponent(fromPath)}` : ""}`} className={buttonVariants({ variant: "outline", size: "icon-lg" })} aria-label={t(`hero.${k}`)} title={t(`hero.${k}`)}>
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
              {primaryAction}
            </div>
          </div>
          <p className="text-sm text-muted-foreground" data-testid="hero-note">
            {archived ? t("archived.heroNote") : notes.review}
          </p>
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-3">
        <div className="min-w-0 space-y-5 xl:col-span-2">
          <TabNav
            label={t("hero.sections")}
            tabs={DETAIL_TABS.map((k) => ({ href: tabHref(k), label: tabLabel[k], active: tab === k }))}
          />

      {/* ── Tab Thông tin: ảnh + form sửa ── */}
      {tab === "info" && (
      <Section id="step-create" className="scroll-mt-20" title={<StepTitle step={step("create")} t={t} />}>
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
      )}

      {/* ── Tab Tồn & nhập hàng ── */}
      {tab === "stock" && stock && (
      <Section
        id="step-stock"
        className="scroll-mt-20"
        title={<StepTitle step={step("stock")} t={t} />}
        actions={
          <div className="flex flex-wrap gap-2">
            {/* SP ngừng kinh doanh: form nhập không mở được (0 SKU) → chỉ xem tồn; khôi phục để nhập thêm. */}
            {!archived && (
              <LinkButton href={`/admin/inventory/documents/new?type=RECEIVE&product=${product.id}`} icon="new">
                {t("block.receive")}
              </LinkButton>
            )}
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
      )}

      {/* ── Tab Giá bán — nơi đặt giá chính là trang Giá bán (QT1b) ── */}
      {tab === "price" && pricing && (
      <Section
        id="step-price"
        className="scroll-mt-20"
        title={<StepTitle step={step("price")} t={t} />}
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
                      {row.cost.source && <div className="text-muted-foreground">{row.cost.source.documentCode}</div>}
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
                <Td label={t("weight")} className="text-xs tabular-nums">{v.weightGrams ? `${fmtInt(v.weightGrams)} g` : "—"}</Td>
              </tr>
            );
          })}
        </DataTable>
        {stepIssues("price").length > 0 && issueList(stepIssues("price"))}
        {/* 16/11: đặt giá ở trang Giá bán (nơi đặt giá chính: Thủ công / Tự động, chọn lô cơ sở) — không còn form riêng ở đây. */}
        {can(user.role, "pricing:manage") && !archived && (
          <div className="flex flex-wrap items-center gap-2" data-testid="price-actions">
            <LinkButton href={`/admin/selling-prices/manual?productId=${product.id}`} variant="primary" icon="edit">{t("priceBlock.setPrice")}</LinkButton>
            <LinkButton href={`/admin/selling-prices?mode=auto&productId=${product.id}`}>{t("priceBlock.calcThis")}</LinkButton>
            <span className="text-xs text-muted-foreground">{t("priceBlock.whereHelp")}</span>
          </div>
        )}
      </Section>
      )}

          {tab === "history" && (
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
          )}
        </div>

        <aside className="space-y-5 xl:sticky xl:top-16">
          {archived ? (
            <section className="space-y-3 rounded-xl border bg-card p-4" data-testid="archived-panel">
              <h2 className="font-medium">{t("archived.title")}</h2>
              <p className="text-sm text-muted-foreground">{t("archived.body")}</p>
              <div className="flex flex-wrap gap-2">
                <LinkButton href={tabHref("stock")}>{t("archived.viewStock")}</LinkButton>
                <LinkButton href={tabHref("history")}>{t("archived.viewHistory")}</LinkButton>
              </div>
            </section>
          ) : (
            <ProductConditions
              steps={flow.steps}
              current={flow.current}
              t={t}
              notes={notes}
              hrefs={{ create: tabHref("info"), stock: tabHref("stock"), price: tabHref("price"), review: "#step-review", publish: "#step-publish" }}
            />
          )}

      {!archived && (
      <>
      {/* ── Duyệt (QT2) — checklist mở bán + nút Duyệt có lưu vết; sửa nội dung/giá/ảnh sau khi duyệt → cần duyệt lại ── */}
      <Section id="step-review" className="scroll-mt-20" title={<StepTitle step={step("review")} t={t} />} testId="launch-check">
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

      {/* ── Đăng bán ── */}
      <Section id="step-publish" className="scroll-mt-20" title={<StepTitle step={step("publish")} t={t} />} testId="step-publish-block">
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
      </>
      )}
        </aside>
      </div>
    </Page>
  );
}
