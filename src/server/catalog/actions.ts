"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z, ZodError } from "zod";
import { directionSchema, formId } from "@/lib/schemas";
import { requirePermission } from "@/server/auth/session";
import type { ActionState } from "@/server/inventory/actions";
import { deleteCategory, removeCategoryIcon, setCategoryIcon, updateCategory } from "./categories";
import { BrandError, deleteBrand, updateBrand } from "./brands";
import { CATALOG_TAG } from "./category-tree";
import { addProductImages, deleteProductImage, reorderProductImage, updateProductImageAlt } from "./images";
import { createBrand, createCategory, saveProduct, setProductsPublished } from "./products";
import { readCatalogFile } from "./catalog-sheet-read";
import { catalogImportInputSchema, commitCatalogImport, previewCatalogImport, type CatalogImportPreview } from "./catalog-import";
import { deleteProducts, moveProductsToWarehouse, restoreProducts } from "./product-delete";
import { ReadinessError } from "./readiness";
import { createProduct } from "./product-create";
import { saveProductPricing } from "./product-pricing";
import { approveProduct } from "./approval";
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

export async function saveProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let id: string;
  try {
    const user = await requirePermission("catalog:manage");
    id = (await saveProduct(withoutPricing(JSON.parse(String(formData.get("payload") ?? "{}"))), user.id)).id;
  } catch (e) {
    if (e instanceof ReadinessError) {
      return { error: `${(await getTranslations("Products"))("readiness.blockedSave")} ${await issuesText(e.issues)}` };
    }
    return { error: message(e) };
  }
  updateTag(CATALOG_TAG); // menu danh mục storefront (SP đăng/ẩn, đổi danh mục)
  revalidatePath("/admin/products");
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
    const user = await requirePermission("catalog:manage");
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

export type ProductBulkState =
  | {
      error?: string;
      done?: { kind: "publish" | "hide" | "restore" | "move"; count: number } | { kind: "delete"; deleted: number; archived: number };
      /** D2: SP không bật được vì còn lỗi mở bán (tên + lý do đã dịch). */
      blocked?: { id: string; name: string; reasons: string }[];
    }
  | undefined;

const bulkIntent = z.union([
  z.enum(["publish", "hide", "delete", "restore", "move"]),
  z.string().regex(/^(delete|restore):[^:]{1,40}$/), // nút ở từng dòng: "delete:<id>"
]);

/**
 * Thao tác trên danh sách SP admin: bật/ẩn/xoá/khôi phục các SP đã tick (`ids`),
 * hoặc một SP từ nút ở dòng (`intent = "delete:<id>"`).
 */
export async function productBulkAction(_prev: ProductBulkState, formData: FormData): Promise<ProductBulkState> {
  let done: NonNullable<ProductBulkState>["done"];
  let blocked: NonNullable<ProductBulkState>["blocked"];
  try {
    const user = await requirePermission("catalog:manage");
    const intent = bulkIntent.parse(formData.get("intent"));
    const [kind, one] = intent.split(":") as ["publish" | "hide" | "delete" | "restore" | "move", string | undefined];
    const ids = one ? [one] : formData.getAll("ids").map(String);
    if (kind === "delete") done = { kind, ...(await deleteProducts(ids, user.id)) };
    else if (kind === "restore") done = { kind, count: await restoreProducts(ids, user.id) };
    else if (kind === "move") done = { kind, count: await moveProductsToWarehouse(ids, formData.get("toLocationId"), user.id) };
    else {
      const res = await setProductsPublished({ ids, published: kind === "publish" }, user.id);
      done = { kind, count: res.changed };
      if (res.blocked.length) blocked = await Promise.all(res.blocked.map(async (b) => ({ id: b.id, name: b.name, reasons: await issuesText(b.issues) })));
    }
  } catch (e) {
    return { error: message(e) };
  }
  updateTag(CATALOG_TAG); // thẻ/trang SP, menu danh mục, bộ lọc storefront
  revalidatePath("/admin/products");
  return { done, blocked };
}

export async function createBrandAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requirePermission("catalog:manage");
    await createBrand(String(formData.get("name") ?? ""));
  } catch (e) {
    return { error: message(e) };
  }
  updateTag(CATALOG_TAG); // bộ lọc thương hiệu storefront
  revalidatePath("/admin/products");
  revalidatePath("/admin/brands");
  return { ok: "brand" };
}

export async function manageBrandAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requirePermission("catalog:manage");
    const id = formId(40).parse(formData.get("brandId"));
    const intent = z.enum(["update", "delete"]).parse(formData.get("intent"));
    if (intent === "delete") await deleteBrand(id);
    else await updateBrand(id, String(formData.get("name") ?? ""));
  } catch (e) {
    return { error: e instanceof BrandError ? (await getTranslations("Products"))(e.code) : message(e) };
  }
  updateTag(CATALOG_TAG);
  revalidatePath("/admin/brands");
  revalidatePath("/admin/products", "layout");
  return { ok: "brand" };
}

export async function createCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requirePermission("catalog:manage");
    await createCategory({
      slug: formData.get("slug"),
      nameMy: formData.get("nameMy"),
      nameEn: formData.get("nameEn"),
      parentId: formData.get("parentId") ?? undefined,
    });
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
  | { preview?: CatalogImportPreview; result?: Awaited<ReturnType<typeof commitCatalogImport>>; error?: string }
  | undefined;

/** Nhập/cập nhật SP từ một sheet: bước "preview" (chỉ đọc) rồi "confirm" (ghi trong một transaction). */
export async function catalogImportAction(_prev: CatalogImportState, formData: FormData): Promise<CatalogImportState> {
  try {
    const user = await requirePermission("catalog:manage");
    if (formData.get("step") === "confirm") {
      const input = catalogImportInputSchema.parse(JSON.parse(z.string().max(6_000_000).parse(formData.get("payload"))));
      const check = await previewCatalogImport(input);
      if (check.counts.stockLines > 0) await requirePermission("stock:receive");
      const result = await commitCatalogImport(input, user.id);
      updateTag(CATALOG_TAG);
      revalidatePath("/admin/products");
      revalidatePath("/admin/inventory/documents");
      return { result };
    }
    const file = await readCatalogFile(formData.get("file"));
    const standardLabel = (await getTranslations("Products"))("standardVariant");
    const preview = await previewCatalogImport({ csv: file.csv, lines: file.lines, standardLabel });
    if (preview.counts.stockLines > 0) await requirePermission("stock:receive");
    return { preview };
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
    await saveProductPricing(
      {
        productId,
        reason: formData.get("reason") ?? "",
        ...(formData.has("fixedProfitMmk") && { fixedProfitMmk: formData.get("fixedProfitMmk") }),
        variants: formData.getAll("variantId").map((id, i) => ({ id, priceMmk: prices[i], affiliateCommissionMmk: commissions[i] ?? "" })),
      },
      user.id,
    );
  } catch (e) {
    return { error: message(e) };
  }
  updateTag(CATALOG_TAG); // giá hiển thị cho khách
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin/products");
  return { ok: "1" };
}

/** Bước 4 (QT2): duyệt SP — chỉ khi checklist mở bán không còn lỗi nào khác; lưu người + thời điểm + dấu vân tay. */
export async function approveProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let id = "";
  try {
    const user = await requirePermission("catalog:approve");
    id = (await approveProduct({ id: formData.get("id") }, user.id)).id;
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath(`/admin/products/${id}`);
  revalidatePath("/admin/products");
  revalidatePath("/admin");
  return { ok: "1" };
}
