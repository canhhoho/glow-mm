"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z, ZodError } from "zod";
import { directionSchema, formId } from "@/lib/schemas";
import { requirePermission } from "@/server/auth/session";
import { can } from "@/server/auth/roles";
import type { ActionState } from "@/server/inventory/actions";
import { deleteCategory, removeCategoryIcon, setCategoryIcon, updateCategory } from "./categories";
import { CATALOG_TAG } from "./category-tree";
import { addProductImages, deleteProductImage, reorderProductImage, updateProductImageAlt } from "./images";
import { createCategory, saveProduct, setProductsPublished } from "./products";
import { readCatalogFile } from "./catalog-sheet-read";
import { catalogImportInputSchema, commitCatalogImport, previewCatalogImport, type CatalogImportPreview } from "./catalog-import";
import { deleteProducts, moveProductsToWarehouse, restoreProducts } from "./product-delete";
import { ReadinessError } from "./readiness";
import { createProduct } from "./product-create";
import { mergeBrands, renameBrand } from "./brand-admin";
import { saveProductPricing } from "./product-pricing";
import { discardChanges, reviewProducts, saveAndApprove, submitProducts, type ReviewResult } from "./review";
import { finishBatchReview, type BatchReviewView } from "./batch-review-text";
import { saveProductPreorder } from "./product-preorder";
import { refreshPrices } from "./refresh-prices";
import type { Issue } from "./readiness-rules";

/** D2: lỗi mở bán → câu báo theo ngôn ngữ admin, kèm SKU liên quan. */
async function issuesText(issues: Issue[]): Promise<string> {
  const t = await getTranslations("Products");
  return issues.map((i) => t(`readiness.issue.${i.code}`) + (i.skus?.length ? ` (${i.skus.join(", ")})` : "")).join("; ");
}

function message(e: unknown): string {
  if (e instanceof ZodError) return e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  if (e instanceof Error) return e.message;
  return String(e);
}

/**
 * QT1b: form sửa SP (bước 1) không đổi giá / hoa hồng CTV / lãi cố định — các trường này chỉ sửa ở bước 3
 * (`saveProductPricingAction`). Bỏ khỏi payload → `saveProduct` giữ giá trị đang có, biến thể mới = giá 0.
 */
function withoutPricing(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload;
  const out: Record<string, unknown> = { ...payload };
  delete out.fixedProfitMmk;
  // Kho bán không chọn ở form (gán khi ghi sổ nhập hàng đầu tiên / chuyển kho hàng loạt).
  delete out.stockLocationId;
  if (Array.isArray(out.variants)) {
    out.variants = out.variants.map((v: unknown) => {
      if (!v || typeof v !== "object") return v;
      const keep: Record<string, unknown> = { ...v };
      delete keep.priceMmk;
      delete keep.affiliateCommissionMmk;
      return keep;
    });
  }
  return out;
}

/**
 * Form sửa SP. `intent`: "save" (mặc định) · "submit" = Lưu & Gửi duyệt · "approve" = Lưu & Duyệt (người có quyền
 * duyệt; SP chưa đăng thì đăng luôn khi có quyền đăng). SP đã duyệt: thay đổi cần duyệt vào bản đang sửa.
 */
export async function saveProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let id: string;
  try {
    const user = await requirePermission("catalog:manage");
    const intent = z.enum(["save", "submit", "approve"]).catch("save").parse(formData.get("intent"));
    const payload = withoutPricing(JSON.parse(String(formData.get("payload") ?? "{}")));
    if (intent === "approve") {
      await requirePermission("catalog:approve");
      id = (await saveAndApprove(payload, user.id, { publish: can(user.role, "catalog:publish") })).id;
    } else {
      id = (await saveProduct(payload, user.id)).id;
      if (intent === "submit") {
        const [res] = await submitProducts({ ids: [id] }, user.id);
        if (!res.ok) {
          revalidatePath(`/admin/products/${id}`);
          const t = await getTranslations("Products");
          return { error: `${t("review.savedNotSubmitted")} ${res.issues ? await issuesText(res.issues) : res.error}` };
        }
      }
    }
  } catch (e) {
    if (e instanceof ReadinessError) {
      return { error: `${(await getTranslations("Products"))("readiness.blockedSave")} ${await issuesText(e.issues)}` };
    }
    return { error: message(e) };
  }
  // Menu danh mục storefront (SP đăng/ẩn, đổi danh mục); "Lưu & Duyệt" áp cả giá chờ duyệt → làm mới như đổi giá.
  refreshPrices();
  redirect(`/admin/products/${id}?saved=1`);
}

/** Bước 1: tạo SP (5 ô) hoặc combo → sang trang SP để làm tiếp các bước. */
export async function createProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let id: string;
  try {
    const user = await requirePermission("catalog:manage");
    id = (await createProduct(JSON.parse(String(formData.get("payload") ?? "{}")), user.id)).id;
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/admin/products");
  redirect(`/admin/products/${id}?created=1`);
}

const publishOneSchema = z.object({ id: formId(40), published: z.enum(["1", "0"]).transform((v) => v === "1") });

/** Bước 5 trên trang SP: bật/ẩn hiển thị một SP (cùng kiểm tra mở bán như bật hàng loạt). */
export async function setProductPublishedAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("catalog:publish");
    const { id, published } = publishOneSchema.parse({ id: formData.get("id"), published: formData.get("published") });
    const res = await setProductsPublished({ ids: [id], published }, user.id);
    if (res.blocked.length) return { error: `${(await getTranslations("Products"))("readiness.blockedSave")} ${await issuesText(res.blocked[0].issues)}` };
    revalidatePath(`/admin/products/${id}`);
  } catch (e) {
    return { error: message(e) };
  }
  updateTag(CATALOG_TAG);
  revalidatePath("/admin/products");
  return { ok: "1" };
}

/** Nút "Khôi phục" trên trang một SP ngừng kinh doanh — cùng hàm domain `restoreProducts` với nút ở danh sách (không tự đăng bán). */
export async function restoreProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("catalog:manage");
    const { id } = z.object({ id: formId(40) }).parse({ id: formData.get("id") });
    await restoreProducts([id], user.id);
    revalidatePath(`/admin/products/${id}`);
  } catch (e) {
    return { error: message(e) };
  }
  refreshPrices();
  revalidatePath("/admin/products");
  revalidatePath("/admin");
  return { ok: "1" };
}

export type ProductBulkState =
  | {
      error?: string;
      done?:
        | { kind: "publish" | "hide" | "restore" | "move"; count: number }
        | { kind: "delete"; deleted: number; archived: number }
        | { kind: "submit" | "approve" | "approvePublish" | "reject"; count: number };
      /** SP không xử lý được (chưa đủ điều kiện, vừa thay đổi…) — tên + lý do đã dịch. */
      blocked?: { id: string; name: string; reasons: string }[];
    }
  | undefined;

const BULK_KINDS = ["publish", "hide", "delete", "restore", "move", "submit", "approve", "approvePublish", "reject"] as const;
type BulkKind = (typeof BULK_KINDS)[number];
const bulkIntent = z.union([
  z.enum(BULK_KINDS),
  z.string().regex(/^(delete|restore):[^:]{1,40}$/), // nút ở từng dòng: "delete:<id>"
]);

/**
 * Thao tác trên danh sách SP admin cho các SP đã tick (`ids`), hoặc một SP từ nút ở dòng (`intent = "delete:<id>"`):
 * đăng/ẩn (quyền đăng), xoá/khôi phục/đổi kho, gửi duyệt; duyệt / duyệt & đăng / từ chối (quyền duyệt) — mỗi SP gửi
 * kèm phiên bản đang hiển thị trên danh sách (`v:<id>`), SP đã đổi sau đó bị bỏ qua. Kết quả theo từng SP.
 */
export async function productBulkAction(_prev: ProductBulkState, formData: FormData): Promise<ProductBulkState> {
  let done: NonNullable<ProductBulkState>["done"];
  let blocked: NonNullable<ProductBulkState>["blocked"];
  try {
    const user = await requirePermission("catalog:manage");
    const intent = bulkIntent.parse(formData.get("intent"));
    const [kind, one] = intent.split(":") as [BulkKind, string | undefined];
    const ids = one ? [one] : formData.getAll("ids").map(String);
    if (kind === "delete") done = { kind, ...(await deleteProducts(ids, user.id)) };
    else if (kind === "restore") done = { kind, count: await restoreProducts(ids, user.id) };
    else if (kind === "move") done = { kind, count: await moveProductsToWarehouse(ids, formData.get("toLocationId"), user.id) };
    else if (kind === "publish" || kind === "hide") {
      await requirePermission("catalog:publish");
      const res = await setProductsPublished({ ids, published: kind === "publish" }, user.id);
      done = { kind, count: res.changed };
      if (res.blocked.length) blocked = await Promise.all(res.blocked.map(async (b) => ({ id: b.id, name: b.name, reasons: await issuesText(b.issues) })));
    } else {
      let results: ReviewResult[];
      if (kind === "submit") results = await submitProducts({ ids }, user.id);
      else {
        await requirePermission("catalog:approve");
        if (kind === "approvePublish") await requirePermission("catalog:publish");
        const items = ids.map((id) => ({ id, version: formData.get(`v:${id}`) ?? "-1" }));
        results = await reviewProducts({ decision: kind, items, reason: formData.get("reason") ?? undefined }, user.id);
      }
      done = { kind, count: results.filter((r) => r.ok).length };
      const failed = results.filter((r) => !r.ok);
      if (failed.length) blocked = await Promise.all(failed.map(async (r) => ({ id: r.id, name: r.name, reasons: r.issues ? await issuesText(r.issues) : (r.error ?? "") })));
    }
  } catch (e) {
    return { error: message(e) };
  }
  refreshPrices(); // thẻ/trang SP, menu danh mục, bộ lọc storefront; duyệt hàng loạt áp giá chờ duyệt
  revalidatePath("/admin");
  return { done, blocked };
}

export async function createCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("catalog:manage");
    await createCategory(
      {
        slug: formData.get("slug"),
        nameMy: formData.get("nameMy"),
        nameEn: formData.get("nameEn"),
        parentId: formData.get("parentId") ?? undefined,
      },
      user.id,
    );
  } catch (e) {
    return { error: message(e) };
  }
  updateTag(CATALOG_TAG);
  revalidatePath("/admin/products");
  revalidatePath("/admin/categories");
  return { ok: "category" };
}

// ───────────────────────── Danh mục (P6) ─────────────────────────

/** Danh mục đổi → menu + nhóm hàng trang chủ (CATALOG_TAG) và trang quản lý. */
function categoriesChanged() {
  updateTag(CATALOG_TAG);
  revalidatePath("/admin/categories", "layout"); // gồm trang sửa /admin/categories/[id]
}

export async function updateCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("catalog:manage");
    await updateCategory(
      formId(40).parse(formData.get("categoryId")),
      {
        slug: String(formData.get("slug") ?? ""),
        nameMy: String(formData.get("nameMy") ?? ""),
        nameEn: String(formData.get("nameEn") ?? ""),
        parentId: String(formData.get("parentId") ?? ""),
        sortOrder: String(formData.get("sortOrder") ?? "0"),
      },
      user.id,
    );
  } catch (e) {
    return { error: message(e) };
  }
  categoriesChanged();
  revalidatePath("/admin/products"); // ô chọn danh mục ở form SP
  return { ok: "saved" };
}

export async function setCategoryIconAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("catalog:manage");
    const file = formData.get("icon");
    if (!(file instanceof File) || file.size === 0) return { error: "Chưa chọn ảnh" };
    await setCategoryIcon(
      formId(40).parse(formData.get("categoryId")),
      { data: Buffer.from(await file.arrayBuffer()), mime: file.type },
      user.id,
    );
  } catch (e) {
    return { error: message(e) };
  }
  categoriesChanged();
  return { ok: "uploaded" };
}

export async function removeCategoryIconAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("catalog:manage");
    await removeCategoryIcon(formId(40).parse(formData.get("categoryId")), user.id);
  } catch (e) {
    return { error: message(e) };
  }
  categoriesChanged();
  return { ok: "removed" };
}

export async function deleteCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("catalog:manage");
    await deleteCategory(formId(40).parse(formData.get("categoryId")), user.id);
  } catch (e) {
    return { error: message(e) };
  }
  categoriesChanged();
  revalidatePath("/admin/products"); // ô chọn danh mục ở form SP
  return { ok: "deleted" };
}

// ───────────────────────── Thương hiệu (21/11/2026, audit #14) ─────────────────────────

/** Tên thương hiệu hiện ở thẻ SP / bộ lọc web khách → xoá cache catalog. */
function brandsChanged() {
  updateTag(CATALOG_TAG);
  revalidatePath("/admin/brands");
  revalidatePath("/admin/products");
}

export async function renameBrandAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("catalog:manage");
    await renameBrand({ id: formId(40).parse(formData.get("brandId")), name: formData.get("name") }, user.id);
  } catch (e) {
    return { error: message(e) };
  }
  brandsChanged();
  return { ok: "renamed" };
}

export async function mergeBrandsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("catalog:manage");
    await mergeBrands({ fromId: formId(40).parse(formData.get("brandId")), toId: formId(40).parse(formData.get("toId")) }, user.id);
  } catch (e) {
    return { error: message(e) };
  }
  brandsChanged();
  return { ok: "merged" };
}

// ───────────────────────── Ảnh sản phẩm ─────────────────────────

const id = formId(40);

/** Ảnh hiện trên trang SP và thẻ SP (ảnh đầu) ở mọi danh sách → xoá cache catalog storefront (P20). */
function revalidateProduct(productId: string) {
  revalidatePath(`/admin/products/${productId}`);
  updateTag(CATALOG_TAG);
}

export async function addProductImagesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let productId: string;
  try {
    const user = await requirePermission("catalog:manage");
    productId = id.parse(formData.get("productId"));
    const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    const uploads = await Promise.all(files.map(async (f) => ({ data: Buffer.from(await f.arrayBuffer()), mime: f.type })));
    await addProductImages(productId, uploads, user.id);
  } catch (e) {
    return { error: message(e) };
  }
  revalidateProduct(productId);
  return { ok: "uploaded" };
}

export async function reorderProductImageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("catalog:manage");
    const input = z.object({ imageId: id, direction: directionSchema }).parse(Object.fromEntries(formData));
    const r = await reorderProductImage(input.imageId, input.direction, user.id);
    if (r.moved) revalidateProduct(r.productId);
  } catch (e) {
    return { error: message(e) };
  }
  return { ok: "moved" };
}

export async function updateProductImageAltAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("catalog:manage");
    const input = z.object({ imageId: id, alt: z.string().max(200).default("") }).parse(Object.fromEntries(formData));
    const image = await updateProductImageAlt(input.imageId, input.alt, user.id);
    revalidateProduct(image.productId);
  } catch (e) {
    return { error: message(e) };
  }
  return { ok: "alt" };
}

export async function deleteProductImageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("catalog:manage");
    const { productId } = await deleteProductImage(id.parse(formData.get("imageId")), user.id);
    revalidateProduct(productId);
  } catch (e) {
    return { error: message(e) };
  }
  return { ok: "deleted" };
}

export type CatalogImportState =
  | { preview?: CatalogImportPreview; sheetName?: string; result?: Omit<Awaited<ReturnType<typeof commitCatalogImport>>, "review">; review?: BatchReviewView; error?: string }
  | undefined;

/** Nhập/cập nhật SP từ một sheet: bước "preview" (chỉ đọc) rồi "confirm" (ghi trong một transaction). */
export async function catalogImportAction(_prev: CatalogImportState, formData: FormData): Promise<CatalogImportState> {
  try {
    const user = await requirePermission("catalog:manage");
    if (formData.get("step") === "confirm") {
      const input = catalogImportInputSchema.parse(JSON.parse(z.string().max(6_000_000).parse(formData.get("payload"))));
      // §6.4: "Gửi duyệt ngay" (form bật sẵn) chạy cùng transaction; "Duyệt luôn" chỉ người có quyền duyệt, chạy sau commit.
      const submit = formData.get("submitNow") === "on";
      const approve = submit && formData.get("approveNow") === "on";
      if (approve) await requirePermission("catalog:approve");
      const { review, ...result } = await commitCatalogImport(input, user.id, { submit });
      // 16/11: xoá cache ngay sau commit (trước bước duyệt luôn) — bước sau lỗi thì web vẫn không giữ giá cũ.
      refreshPrices();
      const reviewView = review ? await finishBatchReview(review, user.id, approve) : undefined;
      refreshPrices();
      return { result, review: reviewView };
    }
    const selectedSheet = formData.get("sheet");
    const sheetName = selectedSheet === null ? undefined : z.string().min(1).max(128).parse(selectedSheet);
    const file = await readCatalogFile(formData.get("file"), sheetName);
    const standardLabel = (await getTranslations("Products"))("standardVariant");
    const preview = await previewCatalogImport({ csv: file.csv, lines: file.lines, standardLabel });
    return { preview, sheetName: file.sheetName };
  } catch (e) {
    return { error: message(e) };
  }
}

/**
 * Bước 3 "Giá bán": sửa tay giá (bắt buộc lý do), hoa hồng CTV cố định, lãi cố định MMK của một SP.
 * Ô cùng thứ tự: `variantId[]`, `priceMmk[]`, `affiliateCommissionMmk[]`.
 */
export async function saveProductPricingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let productId = "";
  try {
    const user = await requirePermission("pricing:manage");
    productId = String(formData.get("productId") ?? "");
    const prices = formData.getAll("priceMmk");
    const commissions = formData.getAll("affiliateCommissionMmk");
    const expected = formData.getAll("expectedPriceMmk");
    await saveProductPricing(
      {
        productId,
        reason: formData.get("reason") ?? "",
        ...(formData.has("fixedProfitMmk") && { fixedProfitMmk: formData.get("fixedProfitMmk") }),
        variants: formData.getAll("variantId").map((id, i) => ({
          id,
          priceMmk: prices[i],
          affiliateCommissionMmk: commissions[i] ?? "",
          // P0-H2: chặn ghi đè giá vừa đổi ở nơi khác (form cũ đang mở).
          ...(expected[i] !== undefined && expected[i] !== "" && { expectedPriceMmk: expected[i] }),
        })),
      },
      user.id,
    );
  } catch (e) {
    return { error: message(e) };
  }
  refreshPrices();
  return { ok: "1" };
}

/** Duyệt / từ chối / huỷ bản đang sửa có thể áp hoặc bỏ giá chờ duyệt → làm mới như đổi giá (R8). */
function reviewDone() {
  refreshPrices();
  revalidatePath("/admin");
}

async function resultText(results: ReviewResult[]) {
  const failed = results.filter((r) => !r.ok);
  if (failed.length === 0) return null;
  const lines = await Promise.all(failed.map(async (r) => `${r.name}: ${r.issues ? await issuesText(r.issues) : r.error}`));
  return lines.join(" · ");
}

/** Gửi duyệt (một SP từ trang SP, hoặc nhiều SP `ids[]` từ danh sách). */
export async function submitProductsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("catalog:manage");
    const ids = formData.getAll("ids").map(String);
    const error = await resultText(await submitProducts({ ids }, user.id));
    if (error) {
      reviewDone();
      return { error };
    }
  } catch (e) {
    return { error: message(e) };
  }
  reviewDone();
  return { ok: "1" };
}

/**
 * Duyệt / Duyệt & Đăng / Từ chối. Mỗi SP gửi kèm phiên bản đã xem (`items` = JSON `[{id, version}]`) — đổi sau
 * lúc xem thì bỏ qua SP đó. Duyệt & Đăng cần thêm quyền đăng.
 */
export async function reviewProductsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("catalog:approve");
    const decision = z.enum(["approve", "approvePublish", "reject"]).parse(formData.get("decision"));
    if (decision === "approvePublish") await requirePermission("catalog:publish");
    const items = z.array(z.object({ id: z.string(), version: z.coerce.number() })).parse(JSON.parse(String(formData.get("items") ?? "[]")));
    const error = await resultText(await reviewProducts({ decision, items, reason: formData.get("reason") ?? undefined }, user.id));
    if (error) {
      reviewDone();
      return { error };
    }
  } catch (e) {
    return { error: message(e) };
  }
  reviewDone();
  return { ok: "1" };
}

/** Huỷ bản đang sửa của SP đã duyệt (về bản đang bán). */
export async function discardChangesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("catalog:manage");
    await discardChanges({ id: String(formData.get("id") ?? "") }, user.id);
  } catch (e) {
    return { error: message(e) };
  }
  reviewDone();
  return { ok: "1" };
}

/** Bước 5 (QT3): bật/tắt đặt trước khi hết hàng + hạn mức theo biến thể (`variantId[]` / `preorderLimit[]` cùng thứ tự). */
/**
 * Gán kho bán cho MỘT SP chưa có kho (trang SP bước 2) — để bán đặt trước khi chưa nhập hàng. Lối tắt của "Đổi kho"
 * ở danh sách: cùng hàm domain `moveProductsToWarehouse` (kiểm kho bán, combo cùng kho, audit).
 */
export async function assignProductWarehouseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let productId = "";
  try {
    const user = await requirePermission("catalog:manage");
    productId = String(formData.get("productId") ?? "");
    await moveProductsToWarehouse([productId], formData.get("toLocationId"), user.id);
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath(`/admin/products/${productId}`);
  return { ok: "1" };
}

export async function saveProductPreorderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let productId = "";
  try {
    const user = await requirePermission("catalog:manage");
    productId = String(formData.get("productId") ?? "");
    const limits = formData.getAll("preorderLimit");
    await saveProductPreorder(
      { productId, enabled: formData.get("preorderEnabled") === "on", limits: formData.getAll("variantId").map((id, i) => ({ id, limit: limits[i] ?? "" })) },
      user.id,
    );
  } catch (e) {
    return { error: message(e) };
  }
  updateTag(CATALOG_TAG); // nhãn "Đặt trước" trên storefront
  revalidatePath(`/admin/products/${productId}`);
  return { ok: "1" };
}
