import "server-only";
import { z } from "zod";
import { directionSchema } from "@/lib/schemas";
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
import { CatalogError } from "./products";

/**
 * Ảnh sản phẩm: file PUBLIC qua storage adapter (key `products/<slug>/<id>.<ext>`) → FileObject → ProductImage.
 * Thứ tự hiển thị theo sortOrder (ảnh đầu tiên là ảnh đại diện).
 */

export type { ImageUpload } from "@/server/files/public-images";
export const IMAGE_MAX_PER_UPLOAD = 10;

// Như các nghiệp vụ khác: chờ kết nối lâu hơn mặc định 2s khi server bận.
const TX = { maxWait: 10_000, timeout: 30_000 };

/** Khoá dòng Product để thêm/sắp xếp ảnh không giẫm sortOrder của nhau. */
async function lockProduct(tx: Tx, productId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${productId} FOR UPDATE`;
}

export async function addProductImages(productId: string, files: ImageUpload[], userId: string) {
  if (files.length === 0) throw new CatalogError("Chưa chọn ảnh");
  if (files.length > IMAGE_MAX_PER_UPLOAD) throw new CatalogError(`Tối đa ${IMAGE_MAX_PER_UPLOAD} ảnh mỗi lần`);
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, slug: true } });
  if (!product) throw new CatalogError("Không tìm thấy sản phẩm");

  const stored = await putPublicImages(`products/${product.slug}`, files, CatalogError);
  try {
    return await prisma.$transaction(async (tx) => {
      await lockProduct(tx, product.id);
      const last = await tx.productImage.aggregate({ where: { productId: product.id }, _max: { sortOrder: true } });
      let sortOrder = (last._max.sortOrder ?? -1) + 1;
      const images = [];
      for (const f of stored) {
        const file = await tx.fileObject.create({ data: { ...f, visibility: "PUBLIC" } });
        images.push(await tx.productImage.create({ data: { productId: product.id, fileId: file.id, sortOrder: sortOrder++ } }));
      }
      await tx.auditLog.create({
        data: { userId, action: "product.image.add", entity: "Product", entityId: product.id, data: { imageIds: images.map((i) => i.id) } },
      });
      return images;
    }, TX);
  } catch (e) {
    await discardStored(stored);
    throw e;
  }
}

async function findImage(imageId: string) {
  const image = await prisma.productImage.findUnique({ where: { id: imageId } });
  if (!image) throw new CatalogError("Không tìm thấy ảnh");
  return image;
}

export async function reorderProductImage(imageId: string, direction: "up" | "down", userId: string) {
  const dir = directionSchema.parse(direction);
  const { productId } = await findImage(imageId);
  return prisma.$transaction(async (tx) => {
    await lockProduct(tx, productId);
    const list = await tx.productImage.findMany({ where: { productId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
    const from = list.findIndex((i) => i.id === imageId);
    const to = dir === "up" ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= list.length) return { productId, moved: false };
    [list[from], list[to]] = [list[to], list[from]];
    // Đánh số lại 0..n-1 để sortOrder luôn liền mạch, không trùng.
    for (const [i, img] of list.entries()) {
      if (img.sortOrder !== i) await tx.productImage.update({ where: { id: img.id }, data: { sortOrder: i } });
    }
    await tx.auditLog.create({
      data: { userId, action: "product.image.reorder", entity: "Product", entityId: productId, data: { imageId, direction: dir } },
    });
    return { productId, moved: true };
  }, TX);
}

export async function updateProductImageAlt(imageId: string, alt: string, userId: string) {
  const clean = toUnicode(z.string().trim().max(200).parse(alt));
  const image = await findImage(imageId);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.productImage.update({ where: { id: image.id }, data: { alt: clean || null } });
    await tx.auditLog.create({
      data: { userId, action: "product.image.alt", entity: "Product", entityId: image.productId, data: { imageId } },
    });
    return updated;
  }, TX);
}

/** Xoá ảnh; FileObject + file trên storage chỉ xoá khi không còn dòng nào khác dùng. */
export async function deleteProductImage(imageId: string, userId: string) {
  const image = await findImage(imageId);
  const orphanKey = await prisma.$transaction(async (tx) => {
    await lockProduct(tx, image.productId);
    await tx.productImage.delete({ where: { id: image.id } });
    const key = await deleteFileIfUnused(tx, image.fileId);
    await tx.auditLog.create({
      data: { userId, action: "product.image.delete", entity: "Product", entityId: image.productId, data: { imageId, fileId: image.fileId } },
    });
    return key;
  }, TX);
  await deleteStoredKeys([orphanKey]);
  return { productId: image.productId, fileDeleted: !!orphanKey };
}
