"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { z, ZodError } from "zod";
import { requirePermission } from "@/server/auth/session";
import type { ActionState } from "@/server/inventory/actions";
import { CATALOG_TAG } from "./category-tree";
import { addProductImages, deleteProductImage, reorderProductImage, updateProductImageAlt } from "./images";
import { createBrand, createCategory, importOpeningStockCsv, importProductsCsv, saveProduct, type ImportResult } from "./products";

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
  return { ok: "category" };
}

// ───────────────────────── Ảnh sản phẩm ─────────────────────────

const id = z.string().trim().min(1).max(40);

function revalidateProduct(productId: string) {
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/[locale]/p/[slug]", "page");
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
    const input = z.object({ imageId: id, direction: z.enum(["up", "down"]) }).parse(Object.fromEntries(formData));
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

const MAX_CSV_BYTES = 2 * 1024 * 1024;

async function readCsv(formData: FormData): Promise<string> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Chưa chọn file CSV");
  if (file.size > MAX_CSV_BYTES) throw new Error("File quá lớn (tối đa 2 MB)");
  return file.text();
}

export async function importProductsAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  try {
    const user = await requirePermission("catalog:manage");
    const result = await importProductsCsv(await readCsv(formData), user.id);
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
    return await importOpeningStockCsv(await readCsv(formData), user.id);
  } catch (e) {
    return { ok: 0, errors: [], error: message(e) };
  }
}
