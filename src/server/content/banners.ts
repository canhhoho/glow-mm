import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { toUnicode } from "@/lib/myanmar";
import {
  deleteFileIfUnused,
  deleteStoredKeys,
  discardStored,
  putPublicImages,
  type ImageUpload,
} from "@/server/files/public-images";
import type { Tx } from "@/server/inventory/ledger";
import { ContentError, directionSchema, inSchedule, linkSchema, moveInList, scheduleSchema, type Direction } from "./common";

/**
 * Banner carousel trang chủ: ảnh desktop (3:1) bắt buộc + ảnh mobile (3:2) tuỳ chọn, theo ngôn ngữ, có lịch hiển thị.
 * Ảnh lưu PUBLIC qua storage adapter dưới `banners/`.
 */

const TX = { maxWait: 10_000, timeout: 30_000 };

const bannerSchema = z
  .object({
    alt: z.string().trim().min(1).max(200).transform(toUnicode),
    locale: z.enum(["my", "en"]).nullable(),
    href: linkSchema,
    active: z.boolean(),
  })
  .and(scheduleSchema);

export type BannerInput = z.input<typeof bannerSchema>;

/** Khoá thứ tự banner trong transaction (thêm/sắp xếp đồng thời không trùng sortOrder). */
async function lockOrder(tx: Tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('banner-order'))`;
}

async function findBanner(id: string) {
  const banner = await prisma.banner.findUnique({ where: { id } });
  if (!banner) throw new ContentError("Không tìm thấy banner");
  return banner;
}

export async function createBanner(raw: BannerInput, images: { desktop: ImageUpload; mobile?: ImageUpload | null }, userId: string) {
  const input = bannerSchema.parse(raw);
  const files = [images.desktop, ...(images.mobile ? [images.mobile] : [])];
  const stored = await putPublicImages("banners", files, ContentError);
  try {
    return await prisma.$transaction(async (tx) => {
      await lockOrder(tx);
      const last = await tx.banner.aggregate({ _max: { sortOrder: true } });
      const created = [];
      for (const f of stored) created.push(await tx.fileObject.create({ data: { ...f, visibility: "PUBLIC" } }));
      const [desktop, mobile] = created;
      const banner = await tx.banner.create({
        data: { ...input, desktopFileId: desktop.id, mobileFileId: mobile?.id ?? null, sortOrder: (last._max.sortOrder ?? -1) + 1 },
      });
      await tx.auditLog.create({ data: { userId, action: "banner.create", entity: "Banner", entityId: banner.id } });
      return banner;
    }, TX);
  } catch (e) {
    await discardStored(stored);
    throw e;
  }
}

/** Sửa banner; ảnh mới (nếu có) thay ảnh cũ, `removeMobile` bỏ ảnh mobile. File cũ không còn dùng thì xoá. */
export async function updateBanner(
  id: string,
  raw: BannerInput,
  images: { desktop?: ImageUpload | null; mobile?: ImageUpload | null; removeMobile?: boolean },
  userId: string,
) {
  const input = bannerSchema.parse(raw);
  const banner = await findBanner(id);
  const [newDesktop] = images.desktop ? await putPublicImages("banners", [images.desktop], ContentError) : [];
  let newMobile;
  try {
    [newMobile] = images.mobile ? await putPublicImages("banners", [images.mobile], ContentError) : [];
  } catch (e) {
    await discardStored(newDesktop ? [newDesktop] : []);
    throw e;
  }
  const stored = [newDesktop, newMobile].filter((f) => !!f);
  try {
    const orphanKeys = await prisma.$transaction(async (tx) => {
      const data: { desktopFileId?: string; mobileFileId?: string | null } = {};
      if (newDesktop) data.desktopFileId = (await tx.fileObject.create({ data: { ...newDesktop, visibility: "PUBLIC" } })).id;
      if (newMobile) data.mobileFileId = (await tx.fileObject.create({ data: { ...newMobile, visibility: "PUBLIC" } })).id;
      else if (images.removeMobile) data.mobileFileId = null;
      await tx.banner.update({ where: { id: banner.id }, data: { ...input, ...data } });
      const keys = [];
      if (data.desktopFileId) keys.push(await deleteFileIfUnused(tx, banner.desktopFileId));
      if (data.mobileFileId !== undefined && banner.mobileFileId) keys.push(await deleteFileIfUnused(tx, banner.mobileFileId));
      await tx.auditLog.create({ data: { userId, action: "banner.update", entity: "Banner", entityId: banner.id } });
      return keys;
    }, TX);
    await deleteStoredKeys(orphanKeys);
  } catch (e) {
    await discardStored(stored);
    throw e;
  }
}

export async function deleteBanner(id: string, userId: string) {
  const banner = await findBanner(id);
  const keys = await prisma.$transaction(async (tx) => {
    await tx.banner.delete({ where: { id: banner.id } });
    const out = [await deleteFileIfUnused(tx, banner.desktopFileId)];
    if (banner.mobileFileId) out.push(await deleteFileIfUnused(tx, banner.mobileFileId));
    await tx.auditLog.create({ data: { userId, action: "banner.delete", entity: "Banner", entityId: banner.id } });
    return out;
  }, TX);
  await deleteStoredKeys(keys);
}

export async function moveBanner(id: string, direction: Direction, userId: string) {
  const dir = directionSchema.parse(direction);
  return prisma.$transaction(async (tx) => {
    await lockOrder(tx);
    const list = await tx.banner.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, sortOrder: true } });
    const next = moveInList(
      list.map((b) => b.id),
      id,
      dir,
    );
    if (!next) return false;
    // Đánh số lại 0..n-1 để sortOrder luôn liền mạch.
    for (const [i, bid] of next.entries()) {
      if (list.find((b) => b.id === bid)?.sortOrder !== i) await tx.banner.update({ where: { id: bid }, data: { sortOrder: i } });
    }
    await tx.auditLog.create({ data: { userId, action: "banner.move", entity: "Banner", entityId: id, data: { direction: dir } } });
    return true;
  }, TX);
}

export async function setBannerActive(id: string, active: boolean, userId: string) {
  const banner = await findBanner(id);
  await prisma.$transaction(async (tx) => {
    await tx.banner.update({ where: { id: banner.id }, data: { active: z.boolean().parse(active) } });
    await tx.auditLog.create({ data: { userId, action: "banner.active", entity: "Banner", entityId: banner.id, data: { active } } });
  }, TX);
}

export async function listBannersAdmin() {
  return prisma.banner.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { desktopFile: { select: { url: true } }, mobileFile: { select: { url: true } } },
  });
}

export async function getBannerAdmin(id: string) {
  return prisma.banner.findUnique({
    where: { id },
    include: { desktopFile: { select: { url: true } }, mobileFile: { select: { url: true } } },
  });
}

export type StoreBanner = { id: string; alt: string; href: string | null; desktopUrl: string; mobileUrl: string | null };

/** Banner đang hiện cho ngôn ngữ `locale` tại thời điểm `now`, theo thứ tự. */
export async function activeBanners(locale: string, now: Date): Promise<StoreBanner[]> {
  const rows = await prisma.banner.findMany({
    where: { active: true, OR: [{ locale: null }, { locale }], ...inSchedule(now) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { desktopFile: { select: { url: true } }, mobileFile: { select: { url: true } } },
  });
  return rows.map((b) => ({
    id: b.id,
    alt: b.alt,
    href: b.href,
    desktopUrl: b.desktopFile.url,
    mobileUrl: b.mobileFile?.url ?? null,
  }));
}
