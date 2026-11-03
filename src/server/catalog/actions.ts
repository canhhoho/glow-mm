"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { z, ZodError } from "zod";
import { directionSchema, formId } from "@/lib/schemas";
import { requirePermission } from "@/server/auth/session";
import type { ActionState } from "@/server/inventory/actions";
import { deleteCategory, removeCategoryIcon, setCategoryIcon, updateCategory } from "./categories";
import { CATALOG_TAG } from "./category-tree";
import { addProductImages, deleteProductImage, reorderProductImage, updateProductImageAlt } from "./images";
import { createBrand, createCategory, importOpeningStockCsv, importProductsCsv, saveProduct, type ImportResult } from "./products";
import { readImportFile } from "./import-file";

function message(e: unknown): string {
  if (e instanceof ZodError) return e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  if (e instanceof Error) return e.message;
  return String(e);
}

export async function saveProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let id: string;
  try {
    const user = await requirePermission("catalog:manage");
    id = (await saveProduct(JSON.parse(String(formData.get("payload") ?? "{}")), user.id)).id;
  } catch (e) {
    return { error: message(e) };
  }
  updateTag(CATALOG_TAG); // menu danh mục storefront (SP đăng/ẩn, đổi danh mục)
  revalidatePath("/admin/products");
  redirect(`/admin/products/${id}?saved=1`);
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
  revalidatePath("/admin/categories");
}

export async function updateCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("catalog:manage");
    await updateCategory(
      formId(40).parse(formData.get("categoryId")),
      {
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

export type ImportState = (ImportResult & { error?: string }) | undefined;

export async function importProductsAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  try {
    const user = await requirePermission("catalog:manage");
    const input = await readImportFile(formData.get("file"), "products");
    const result = await importProductsCsv(input.csv, user.id, input.lineNumbers);
    updateTag(CATALOG_TAG);
    revalidatePath("/admin/products");
    return result;
  } catch (e) {
    return { ok: 0, errors: [], error: message(e) };
  }
}

export async function importStockAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  try {
    const user = await requirePermission("stock:receive");
    const input = await readImportFile(formData.get("file"), "stock");
    return await importOpeningStockCsv(input.csv, user.id, input.lineNumbers);
  } catch (e) {
    return { ok: 0, errors: [], error: message(e) };
  }
}
