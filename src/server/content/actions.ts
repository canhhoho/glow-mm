"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { ZodError } from "zod";
import { directionSchema, formId } from "@/lib/schemas";
import { yangonLocalToUtc } from "@/lib/time";
import { requirePermission } from "@/server/auth/session";
import type { ActionState } from "@/server/inventory/actions";
import { createBanner, deleteBanner, moveBanner, setBannerActive, updateBanner } from "./banners";
import {
  addCollectionProducts,
  createCollection,
  deleteCollection,
  moveCollection,
  moveCollectionProduct,
  removeCollectionProduct,
  updateCollection,
} from "./collections";
import { HOME_TAG } from "./common";

/** Server Action quản trị nội dung trang chủ (quyền `content:manage`). */

function message(e: unknown): string {
  if (e instanceof ZodError) return e.issues.map((i) => i.message).join("; ");
  if (e instanceof Error) return e.message;
  return String(e);
}

const id = formId(40);
const direction = directionSchema;

/** Ô datetime-local (giờ Yangon) → Date UTC; trống → null. */
function when(v: FormDataEntryValue | null): Date | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? yangonLocalToUtc(s) : null;
}

const checked = (fd: FormData, name: string) => fd.get(name) === "on";

async function upload(fd: FormData, name: string) {
  const f = fd.get(name);
  if (!(f instanceof File) || f.size === 0) return null;
  return { data: Buffer.from(await f.arrayBuffer()), mime: f.type };
}

function changed(paths: string[]) {
  updateTag(HOME_TAG);
  for (const p of paths) revalidatePath(p);
}

// ───────────────────────── Banner ─────────────────────────

function bannerFields(fd: FormData) {
  const locale = String(fd.get("locale") ?? "");
  return {
    alt: String(fd.get("alt") ?? ""),
    locale: locale === "my" || locale === "en" ? locale : null,
    href: String(fd.get("href") ?? ""),
    active: checked(fd, "active"),
    startAt: when(fd.get("startAt")),
    endAt: when(fd.get("endAt")),
  } as const;
}

export async function saveBannerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("content:manage");
    const bannerId = String(fd.get("id") ?? "");
    const [desktop, mobile] = await Promise.all([upload(fd, "desktop"), upload(fd, "mobile")]);
    if (bannerId) {
      await updateBanner(id.parse(bannerId), bannerFields(fd), { desktop, mobile, removeMobile: checked(fd, "removeMobile") }, user.id);
    } else {
      if (!desktop) return { error: "Chưa chọn ảnh desktop" };
      await createBanner(bannerFields(fd), { desktop, mobile }, user.id);
    }
  } catch (e) {
    return { error: message(e) };
  }
  changed(["/admin/content/banners"]);
  redirect("/admin/content/banners?saved=1");
}

export async function moveBannerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("content:manage");
    await moveBanner(id.parse(fd.get("id")), direction.parse(fd.get("direction")), user.id);
  } catch (e) {
    return { error: message(e) };
  }
  changed(["/admin/content/banners"]);
  return { ok: "moved" };
}

export async function toggleBannerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("content:manage");
    await setBannerActive(id.parse(fd.get("id")), fd.get("active") === "true", user.id);
  } catch (e) {
    return { error: message(e) };
  }
  changed(["/admin/content/banners"]);
  return { ok: "toggled" };
}

export async function deleteBannerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("content:manage");
    await deleteBanner(id.parse(fd.get("id")), user.id);
  } catch (e) {
    return { error: message(e) };
  }
  changed(["/admin/content/banners"]);
  return { ok: "deleted" };
}

// ───────────────────────── Bộ sưu tập ─────────────────────────

function collectionFields(fd: FormData) {
  return {
    slug: String(fd.get("slug") ?? ""),
    nameMy: String(fd.get("nameMy") ?? ""),
    nameEn: String(fd.get("nameEn") ?? ""),
    active: checked(fd, "active"),
    showOnHome: checked(fd, "showOnHome"),
    startAt: when(fd.get("startAt")),
    endAt: when(fd.get("endAt")),
  };
}

export async function createCollectionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let newId: string;
  try {
    const user = await requirePermission("content:manage");
    newId = (await createCollection(collectionFields(fd), user.id)).id;
  } catch (e) {
    return { error: message(e) };
  }
  changed(["/admin/content/collections"]);
  redirect(`/admin/content/collections/${newId}`);
}

export async function updateCollectionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("content:manage");
    const cid = id.parse(fd.get("id"));
    await updateCollection(cid, collectionFields(fd), user.id);
    changed(["/admin/content/collections", `/admin/content/collections/${cid}`]);
  } catch (e) {
    return { error: message(e) };
  }
  return { ok: "saved" };
}

export async function deleteCollectionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("content:manage");
    await deleteCollection(id.parse(fd.get("id")), user.id);
  } catch (e) {
    return { error: message(e) };
  }
  changed(["/admin/content/collections"]);
  redirect("/admin/content/collections");
}

export async function moveCollectionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("content:manage");
    await moveCollection(id.parse(fd.get("id")), direction.parse(fd.get("direction")), user.id);
  } catch (e) {
    return { error: message(e) };
  }
  changed(["/admin/content/collections"]);
  return { ok: "moved" };
}

export async function addCollectionProductAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("content:manage");
    const cid = id.parse(fd.get("id"));
    await addCollectionProducts(cid, [id.parse(fd.get("productId"))], user.id);
    changed([`/admin/content/collections/${cid}`]);
  } catch (e) {
    return { error: message(e) };
  }
  return { ok: "added" };
}

export async function removeCollectionProductAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("content:manage");
    const cid = id.parse(fd.get("id"));
    await removeCollectionProduct(cid, id.parse(fd.get("productId")), user.id);
    changed([`/admin/content/collections/${cid}`]);
  } catch (e) {
    return { error: message(e) };
  }
  return { ok: "removed" };
}

export async function moveCollectionProductAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("content:manage");
    const cid = id.parse(fd.get("id"));
    await moveCollectionProduct(cid, id.parse(fd.get("productId")), direction.parse(fd.get("direction")), user.id);
    changed([`/admin/content/collections/${cid}`]);
  } catch (e) {
    return { error: message(e) };
  }
  return { ok: "moved" };
}
