"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requirePermission } from "@/server/auth/session";
import type { ActionState } from "@/server/inventory/actions";
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
    await createCategory({ slug: formData.get("slug"), nameMy: formData.get("nameMy"), nameEn: formData.get("nameEn") });
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/admin/products");
  return { ok: "category" };
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
