import { Check, ChevronLeft, ChevronRight, Copy, ExternalLink, ImagePlus, Pencil, Plus } from "lucide-react";
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
import { assignProductWarehouseAction, discardChangesAction, restoreProductAction, reviewProductsAction, submitProductsAction, setProductPublishedAction } from "@/server/catalog/actions";
import { productPrimaryAction } from "@/server/catalog/product-actions";
import { isSafeInternalPath } from "@/lib/safe-path";
import { loadProductPricing } from "@/server/catalog/product-pricing";
import { loadReadiness } from "@/server/catalog/readiness";
import { productSteps, type Issue, type ProductStep } from "@/server/catalog/readiness-rules";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm } from "@/components/admin/action-form";
import { ProductForm } from "@/components/admin/product-form";
import { ProductConditions, StepTitle } from "@/components/admin/product-steps";
import { IssueList, ProductHistory, ProductImages, ProductPreorderSettings, ProductPriceTable, ProductStockTable, type IssueRow } from "@/components/admin/product-detail";
import { Badge, fieldClass, fieldLabelClass, LinkButton, Notice, Page, Section, TabNav } from "@/components/admin/ui";
import { fmtDateTime, fmtInt } from "@/lib/format";
import { FEATURES } from "@/lib/features";
import { localizedPath } from "@/lib/site";
import { prisma } from "@/lib/db";
import { getNumberSetting } from "@/server/settings";
import { salesBlockDays } from "@/server/inventory/documents";
import { availableToSell } from "@/server/orders/availability";
import { productStockRows } from "@/server/inventory/overview";
import { adjacentProducts } from "@/server/catalog/product-list";
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
  const [pricing, stock, adjacent] = await Promise.all([
    tab === "price" ? loadProductPricing(product.variants.map((v) => v.id), pricingMode) : null,
    tab === "stock" ? productStockRows(product.id, stockNow) : null,
    adjacentProducts(product.id),
  ]);
  const flow = productSteps({ published: product.published, notReceivedSkus: readiness.notReceivedSkus, approved: !!approval.approvedAt && !cr, preorderEnabled: approval.preorderEnabled }, readiness);
  const step = (key: ProductStep) => flow.steps.find((s) => s.key === key)!;

  type Row = IssueRow;
  const isError = (i: Issue) => readiness.errors.some((e) => e.code === i.code);
  const row = (i: Issue): Row => ({ ...i, tone: isError(i) ? "danger" : "warning", kind: t(isError(i) ? "readiness.error" : "readiness.warning") });
  const errors = readiness.errors.map(row);
  const warnings = readiness.warnings.map(row);
  const stepIssues = (key: ProductStep) => step(key).issues.map(row);
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
    // Chưa có hàng nhưng đang bật đặt trước → nhánh "Bán đặt trước" (không bắt nhập kho để đăng bán).
    stock: readiness.notReceivedSkus.length > 0 && stockTotal === 0 && approval.preorderEnabled ? t("hero.noteStockPreorder") : t("hero.noteStock", { n: fmtInt(stockTotal) }),
    price: [priceText ? t("hero.notePrice", { price: priceText }) : t("hero.notePriceMissing"), ...(pendingPrices.length ? [t("hero.notePricePending", { price: range(pendingPrices) })] : [])].join(" · "),
    review: reviewNote,
    publish: product.published ? t("hero.notePublished") : t("hero.noteNotPublished"),
  };
  const variantIds = product.variants.map((v) => v.id);

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

  return (
    <Page>
      {created && <Notice tone="success">{t("created")}</Notice>}
      {saved && <Notice tone="success">{t("saved")}</Notice>}
      {/* Header gọn (18/11/2026): ảnh nhỏ bên trái (bấm → quản lý ảnh ở tab Thông tin); bên phải 3 hàng:
          tên + trạng thái | điều hướng · SKU + metadata · ghi chú | thao tác. Điện thoại: hàng 2–3 trải cả chiều ngang dưới ảnh. */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-xl border bg-card p-3 sm:gap-x-4 sm:p-4" data-testid="product-hero">
        <a
          href={tabHref("info", "#product-images")}
          className="group relative size-16 shrink-0 overflow-hidden rounded-lg border bg-muted sm:row-span-3 sm:size-28"
          aria-label={t("images")}
          title={t("images")}
          data-testid="hero-image"
        >
          {images[0] ? (
            <Image src={images[0].url} alt={images[0].alt || product.en.name} fill sizes="112px" className="object-cover" priority />
          ) : (
            <ImagePlus className="absolute inset-0 m-auto size-6 text-muted-foreground" aria-hidden />
          )}
          <span className="absolute right-1 bottom-1 flex items-center gap-0.5 rounded-md bg-background/90 px-1.5 py-0.5 text-2xs font-medium shadow-sm group-hover:bg-background">
            {images.length > 0 ? images.length : <Plus className="size-3" aria-hidden />}
          </span>
        </a>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="text-lg leading-tight font-semibold break-words sm:text-xl">{product.en.name || product.my.name || product.slug}</h1>
            <Badge tone={PRODUCT_LABEL_TONE[lab.label]}>{t(`lifecycle.${lab.label}`)}</Badge>
            {lab.change && <Badge tone={changeTone(lab.change)}>{t(`change.${lab.change}`)}</Badge>}
          </div>
          <nav aria-label={t("hero.adjacent")} className="flex shrink-0 items-center gap-1">
            <LinkButton href={backHref} icon="back" iconOnly>
              {td("back")}
            </LinkButton>
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
                <span key={k} className={cn(buttonVariants({ variant: "outline", size: "icon-lg" }), "pointer-events-none opacity-40 max-sm:hidden")} aria-hidden>
                  <Icon />
                </span>
              ),
            )}
          </nav>
        </div>
        <p className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground sm:col-span-1">
          <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
            SKU: {product.variants[0]?.sku ?? "—"}
            {product.variants.length > 1 && ` · ${t("list.moreVariants", { n: product.variants.length - 1 })}`}
          </span>
          <span>{t("colBrand")}: <span className="text-foreground">{brandName}</span></span>
          <span>{t("colCategory")}: <span className="text-foreground">{categoryName}</span></span>
          <span>{t("warehouse")}: <span className="text-foreground">{warehouseName}</span></span>
          <span>{t("list.colUpdated")}: <span className="text-foreground">{fmtDateTime(approval.updatedAt)}</span></span>
        </p>
        <div className="col-span-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 sm:col-span-1">
          <p className="min-w-0 text-xs text-muted-foreground" data-testid="hero-note">
            {archived ? t("archived.heroNote") : notes.review}
          </p>
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            {product.published && (
              <a href={localizedPath("my", `/p/${product.slug}`)} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "lg" })}>
                <ExternalLink aria-hidden /> {t("block.viewAsCustomer")}
              </a>
            )}
            <Link href={`/admin/products/new?copyFrom=${product.id}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
              <Copy aria-hidden /> {t("list.duplicate")}
            </Link>
            {primaryAction}
          </div>
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
        {stepIssues("create").length > 0 && <IssueList rows={stepIssues("create")} />}
        <ProductImages product={product} images={images} cr={cr} />
        {/* Form sửa đầy đủ: mở sẵn khi SP chưa đăng bán (đang thiết lập), đóng khi đã bán. key: nạp lại state sau khi lưu. */}
        <details id="product-edit" open={!product.published} className="scroll-mt-28 rounded-xl border p-4" data-testid="product-edit">
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
          {readiness.notReceivedSkus.length > 0 ? t(approval.preorderEnabled ? "block.notReceivedPreorder" : "block.notReceived", { skus: readiness.notReceivedSkus.join(", ") }) : t("block.receivedAll")}
        </p>
        {stepIssues("stock").length > 0 && <IssueList rows={stepIssues("stock")} />}
        {/* Chưa có kho bán (chưa nhập hàng): gán kho ngay tại đây để bán đặt trước — lối tắt của "Đổi kho" ở danh sách. */}
        {!archived && canManage && !product.stockLocationId && options.warehouses.length > 0 && (
          <div className="rounded-lg border border-dashed p-3" data-testid="assign-warehouse">
            <p className="text-sm font-medium">{t("block.warehouseTitle")}</p>
            <p className="mb-2 text-xs text-muted-foreground">{t("block.warehouseHelp")}</p>
            <ActionForm action={assignProductWarehouseAction} submitLabel={t("block.warehouseAssign")} okText={t("block.warehouseAssigned")} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="productId" value={product.id} />
              <label className={fieldLabelClass}>
                <span className="text-muted-foreground">{t("block.warehouseLabel")}</span>
                <select name="toLocationId" required defaultValue={options.warehouses.length === 1 ? options.warehouses[0].id : ""} className={fieldClass}>
                  {options.warehouses.length > 1 && <option value="" disabled>—</option>}
                  {options.warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} — {w.name}
                    </option>
                  ))}
                </select>
              </label>
            </ActionForm>
          </div>
        )}
        {/* QT3: hết hàng → nhận đặt trước (mặc định bật); combo không đặt trước. 20/11/2026: chuyển từ khối Đăng bán về bước 2 —
            bật đặt trước là một nhánh hợp lệ của "Kho bán & hàng" (productSteps). */}
        {!archived && (
        <ProductPreorderSettings product={product} approval={approval} preorderDefault={preorderDefault} preorderLimit={preorderLimit} waitingQty={waitingQty} />
        )}
        {/* P3b: tồn chỉ để xem — cùng số liệu trang Tồn kho; nhập / điều chỉnh qua phiếu kho. */}
        <ProductStockTable stock={stock} stockNow={stockNow} />
      </Section>
      )}

      {/* ── Tab Giá bán — nơi đặt giá chính là trang Giá bán (QT1b) ── */}
      {tab === "price" && pricing && (
      <Section
        id="step-price"
        className="scroll-mt-20"
        title={<StepTitle step={step("price")} t={t} />}
      >
        <ProductPriceTable product={product} pricing={pricing} cr={cr} />
        {stepIssues("price").length > 0 && <IssueList rows={stepIssues("price")} />}
        {/* 16/11: đặt giá ở trang Giá bán (thủ công, chọn lô cơ sở; Tự động đang tắt) — không còn form riêng ở đây. */}
        {can(user.role, "pricing:manage") && !archived && (
          <div className="flex flex-wrap items-center gap-2" data-testid="price-actions">
            <LinkButton href={`/admin/selling-prices?productId=${product.id}`} variant="primary" icon="edit">{t("priceBlock.setPrice")}</LinkButton>
            {FEATURES.autoPricing && <LinkButton href={`/admin/selling-prices?mode=auto&productId=${product.id}`}>{t("priceBlock.calcThis")}</LinkButton>}
            <span className="text-xs text-muted-foreground">{t("priceBlock.whereHelp")}</span>
          </div>
        )}
      </Section>
      )}

          {tab === "history" && (
          <>
          <ProductHistory productId={product.id} variantIds={variantIds} />
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
        {errors.length > 0 && <IssueList rows={errors} />}
        {/* Lưu ý không chặn mở bán: gom lại, mở khi cần. */}
        {warnings.length > 0 && (
          <details data-testid="readiness-warnings">
            <summary className="cursor-pointer text-sm text-muted-foreground">{t("readiness.warningsCount", { count: warnings.length })}</summary>
            <div className="mt-2">{<IssueList rows={warnings} />}</div>
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
      </Section>
      </>
      )}
        </aside>
      </div>
    </Page>
  );
}
