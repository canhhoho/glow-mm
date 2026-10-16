import Rabbit from "rabbit-node";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { LocalDiskStorage } from "@/server/adapters/storage/local";
import { addProductImages, deleteProductImage, reorderProductImage, updateProductImageAlt } from "@/server/catalog/images";
import { createCategory } from "@/server/catalog/products";
import { makeFixture } from "./fixtures";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
const disk = () => new LocalDiskStorage(env().LOCAL_STORAGE_DIR);

const imagesOf = (productId: string) =>
  prisma.productImage.findMany({ where: { productId }, orderBy: { sortOrder: "asc" }, include: { file: true } });

describe("Ảnh sản phẩm", () => {
  it("upload → ProductImage + file PUBLIC đọc được; sắp xếp; alt; xoá dọn file", async () => {
    const f = await makeFixture();
    const slug = `it-${f.tag}`;
    await addProductImages(f.productId, [{ data: PNG, mime: "image/png" }], f.userId);
    // Mime khai báo sai nhưng nội dung là JPEG → lưu theo magic bytes.
    await addProductImages(f.productId, [{ data: JPEG, mime: "image/png" }], f.userId);

    let imgs = await imagesOf(f.productId);
    expect(imgs.map((i) => [i.sortOrder, i.file.mime])).toEqual([
      [0, "image/png"],
      [1, "image/jpeg"],
    ]);
    for (const i of imgs) {
      expect(i.file).toMatchObject({ driver: "LOCAL", visibility: "PUBLIC", url: `/api/files/${i.file.key}` });
      expect(i.file.key).toMatch(new RegExp(`^products/${slug}/[0-9a-f]{24}\\.(png|jpg)$`));
    }
    expect(await disk().get(imgs[0].file.key)).toEqual({ data: PNG, mime: "image/png" });

    // Ảnh thứ 2 lên đầu; ảnh đầu không lên được nữa.
    expect(await reorderProductImage(imgs[1].id, "up", f.userId)).toEqual({ productId: f.productId, moved: true });
    expect((await imagesOf(f.productId)).map((i) => i.id)).toEqual([imgs[1].id, imgs[0].id]);
    expect((await reorderProductImage(imgs[1].id, "up", f.userId)).moved).toBe(false);

    await updateProductImageAlt(imgs[0].id, Rabbit.uni2zg("နေကာခရင်မ်"), f.userId);
    expect((await prisma.productImage.findUniqueOrThrow({ where: { id: imgs[0].id } })).alt).toBe("နေကာခရင်မ်");
    await updateProductImageAlt(imgs[0].id, "  ", f.userId);
    expect((await prisma.productImage.findUniqueOrThrow({ where: { id: imgs[0].id } })).alt).toBeNull();

    imgs = await imagesOf(f.productId);
    for (const i of imgs) {
      expect(await deleteProductImage(i.id, f.userId)).toEqual({ productId: f.productId, fileDeleted: true });
      expect(await prisma.fileObject.findUnique({ where: { id: i.fileId } })).toBeNull();
      expect(await disk().get(i.file.key)).toBeNull();
    }
    expect(await imagesOf(f.productId)).toHaveLength(0);

    const actions = await prisma.auditLog.findMany({ where: { entity: "Product", entityId: f.productId }, select: { action: true } });
    expect(actions.map((a) => a.action).sort()).toEqual([
      "product.image.add",
      "product.image.add",
      "product.image.alt",
      "product.image.alt",
      "product.image.delete",
      "product.image.delete",
      "product.image.reorder",
    ]);
  });

  it("từ chối file không phải ảnh / quá 5MB, không để lại file", async () => {
    const f = await makeFixture();
    await expect(addProductImages(f.productId, [{ data: Buffer.from("<svg/>"), mime: "image/png" }], f.userId)).rejects.toThrow(/không hợp lệ/);
    await expect(addProductImages(f.productId, [{ data: PNG, mime: "image/svg+xml" }], f.userId)).rejects.toThrow(/không hợp lệ/);
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
    await expect(addProductImages(f.productId, [{ data: big, mime: "image/png" }], f.userId)).rejects.toThrow(/không hợp lệ/);
    await expect(addProductImages("khong-co", [{ data: PNG, mime: "image/png" }], f.userId)).rejects.toThrow(/sản phẩm/);
    expect(await imagesOf(f.productId)).toHaveLength(0);
  });

  it("FileObject dùng chung chỉ bị xoá khi dòng cuối cùng được xoá", async () => {
    const f = await makeFixture();
    const [img] = await addProductImages(f.productId, [{ data: PNG, mime: "image/png" }], f.userId);
    const twin = await prisma.productImage.create({ data: { productId: f.productId, fileId: img.fileId, sortOrder: 1 } });
    const { key } = await prisma.fileObject.findUniqueOrThrow({ where: { id: img.fileId } });

    expect((await deleteProductImage(img.id, f.userId)).fileDeleted).toBe(false);
    expect(await disk().get(key)).not.toBeNull();
    expect((await deleteProductImage(twin.id, f.userId)).fileDeleted).toBe(true);
    expect(await disk().get(key)).toBeNull();
    expect(await prisma.fileObject.findUnique({ where: { id: img.fileId } })).toBeNull();
  });

  it("tạo danh mục con với parentId", async () => {
    const f = await makeFixture();
    const child = await createCategory({ slug: `it-${f.tag.toLowerCase()}-sub`, nameMy: "ကလေး", nameEn: "Child", parentId: f.categoryId });
    expect(child.parentId).toBe(f.categoryId);
    const root = await createCategory({ slug: `it-${f.tag.toLowerCase()}-root`, nameMy: "မူလ", nameEn: "Root", parentId: "" });
    expect(root.parentId).toBeNull();
    await expect(createCategory({ slug: `it-${f.tag.toLowerCase()}-x`, nameMy: "x", nameEn: "x", parentId: "khong-co" })).rejects.toThrow(/cha/);
  });
});
