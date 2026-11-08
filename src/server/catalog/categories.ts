import "server-only";
import { z } from "zod";
import { mmTextReq, slugSchema } from "@/lib/schemas";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import {
  deleteFileIfUnused,
  deleteStoredKeys,
  discardStored,
  putPublicImages,
  type ImageUpload,
} from "@/server/files/public-images";
import { CatalogError } from "./products";

/**
 * Quản lý danh mục (P6): sửa slug/tên/cha/thứ tự, icon "nhóm hàng" trên trang chủ.
 * Cây tối đa 2 cấp (khớp menu storefront): danh mục cha phải là danh mục gốc; danh mục đang có con không làm con được.
 * Đổi slug → slug cũ lưu ở `CategorySlugRedirect` để link /c/<slug cũ> đã chia sẻ vẫn chuyển được sang slug mới.
 */

const TX = { maxWait: 10_000, timeout: 30_000 };

const updateSchema = z.object({
  /** Không gửi = giữ slug hiện tại. */
  slug: slugSchema(60, "Slug chỉ gồm a-z, 0-9 và dấu -").optional(),
  nameMy: mmTextReq(80),
  nameEn: z.string().trim().min(1).max(80),
  parentId: z
    .string()
    .trim()
    .max(40)
    .nullish()
    .transform((v) => v || null),
  sortOrder: z.coerce.number().int().min(0).max(9999),
});

export type CategoryUpdateInput = z.input<typeof updateSchema>;

const adminInclude = {
  translations: true,
  icon: { select: { url: true } },
  _count: { select: { products: true, children: true } },
} satisfies Prisma.CategoryInclude;

type AdminCategory = Prisma.CategoryGetPayload<{ include: typeof adminInclude }>;

function toAdminRow(r: AdminCategory) {
  const name = (l: string) => r.translations.find((t) => t.locale === l)?.name ?? "";
  return {
    id: r.id,
    slug: r.slug,
    parentId: r.parentId,
    sortOrder: r.sortOrder,
    nameMy: name("my"),
    nameEn: name("en"),
    iconUrl: r.icon?.url ?? null,
    products: r._count.products,
    children: r._count.children,
  };
}

/** Một danh mục cho trang sửa `/admin/categories/[id]`; không có → null. */
export async function getCategoryAdmin(id: string) {
  const r = await prisma.category.findUnique({ where: { id }, include: adminInclude });
  return r ? toAdminRow(r) : null;
}

/** Danh sách cho trang quản lý; `q` lọc theo slug/tên (giữ cả danh mục cha của mục khớp để thấy ngữ cảnh). */
export async function listCategoriesAdmin(q?: string) {
  const rows = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
    include: adminInclude,
  });
  const toRow = toAdminRow;
  // Gốc trước, con nằm ngay dưới cha.
  const children = new Map<string, typeof rows>();
  for (const r of rows) if (r.parentId) children.set(r.parentId, [...(children.get(r.parentId) ?? []), r]);
  const tree = rows.filter((r) => !r.parentId).flatMap((root) => [toRow(root), ...(children.get(root.id) ?? []).map(toRow)]);

  const query = q?.trim().toLowerCase();
  if (!query) return tree;
  const hits = tree.filter((r) => [r.slug, r.nameMy, r.nameEn].some((v) => v.toLowerCase().includes(query)));
  const keep = new Set(hits.flatMap((r) => (r.parentId ? [r.id, r.parentId] : [r.id])));
  return tree.filter((r) => keep.has(r.id));
}

async function findCategory(id: string) {
  const c = await prisma.category.findUnique({ where: { id }, include: { _count: { select: { children: true } } } });
  if (!c) throw new CatalogError("Không tìm thấy danh mục");
  return c;
}

export async function updateCategory(id: string, raw: CategoryUpdateInput, userId: string) {
  const input = updateSchema.parse(raw);
  const category = await findCategory(id);
  if (input.parentId) {
    if (input.parentId === category.id) throw new CatalogError("Danh mục không thể là cha của chính nó");
    if (category._count.children > 0) throw new CatalogError("Danh mục đang có danh mục con nên phải là danh mục gốc");
    const parent = await prisma.category.findUnique({ where: { id: input.parentId } });
    if (!parent) throw new CatalogError("Danh mục cha không tồn tại");
    if (parent.parentId) throw new CatalogError("Danh mục cha phải là danh mục gốc (tối đa 2 cấp)");
  }
  const slug = input.slug ?? category.slug;
  const slugChanged = slug !== category.slug;
  try {
    return await prisma.$transaction(async (tx) => {
      if (slugChanged) {
        // Dùng lại một slug cũ → bỏ redirect đó; slug vừa bỏ trỏ về danh mục này (ghi đè nếu từng thuộc danh mục khác).
        await tx.categorySlugRedirect.deleteMany({ where: { slug } });
        await tx.categorySlugRedirect.upsert({
          where: { slug: category.slug },
          create: { slug: category.slug, categoryId: category.id },
          update: { categoryId: category.id },
        });
      }
      const updated = await tx.category.update({
        where: { id: category.id },
        data: { slug, parentId: input.parentId, sortOrder: input.sortOrder },
      });
      for (const [locale, name] of [
        ["my", input.nameMy],
        ["en", input.nameEn],
      ] as const) {
        await tx.categoryTranslation.upsert({
          where: { categoryId_locale: { categoryId: category.id, locale } },
          create: { categoryId: category.id, locale, name },
          update: { name },
        });
      }
      await tx.auditLog.create({
        data: {
          userId,
          action: "category.update",
          entity: "Category",
          entityId: category.id,
          data: slugChanged ? { slugFrom: category.slug, slugTo: slug } : undefined,
        },
      });
      return updated;
    }, TX);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new CatalogError("Slug đã được dùng cho danh mục khác");
    }
    throw e;
  }
}

/** Đặt icon (ảnh vuông JPG/PNG/WebP); icon cũ không còn dùng thì xoá. */
export async function setCategoryIcon(id: string, upload: ImageUpload, userId: string) {
  const category = await findCategory(id);
  const stored = await putPublicImages(`categories/${category.slug}`, [upload], CatalogError);
  try {
    const orphan = await prisma.$transaction(async (tx) => {
      const file = await tx.fileObject.create({ data: { ...stored[0], visibility: "PUBLIC" } });
      await tx.category.update({ where: { id: category.id }, data: { iconFileId: file.id } });
      const key = category.iconFileId ? await deleteFileIfUnused(tx, category.iconFileId) : null;
      await tx.auditLog.create({ data: { userId, action: "category.icon.set", entity: "Category", entityId: category.id } });
      return key;
    }, TX);
    await deleteStoredKeys([orphan]);
  } catch (e) {
    await discardStored(stored);
    throw e;
  }
}

/**
 * Xoá danh mục trống (không SP — kể cả SP ẩn — và không danh mục con); bản dịch xoá theo cascade, icon không còn dùng thì dọn.
 * Kiểm tra trong transaction; FK Product → Category vẫn chặn nếu có SP được gán cùng lúc.
 */
export async function deleteCategory(id: string, userId: string) {
  const orphan = await prisma.$transaction(async (tx) => {
    const category = await tx.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true, children: true } } },
    });
    if (!category) throw new CatalogError("Không tìm thấy danh mục");
    if (category._count.products > 0) throw new CatalogError("Danh mục còn sản phẩm, chuyển sản phẩm sang danh mục khác trước");
    if (category._count.children > 0) throw new CatalogError("Danh mục còn danh mục con, xoá hoặc chuyển danh mục con trước");
    await tx.category.delete({ where: { id: category.id } });
    const key = category.iconFileId ? await deleteFileIfUnused(tx, category.iconFileId) : null;
    await tx.auditLog.create({
      data: { userId, action: "category.delete", entity: "Category", entityId: category.id, data: { slug: category.slug } },
    });
    return key;
  }, TX);
  await deleteStoredKeys([orphan]);
}

export async function removeCategoryIcon(id: string, userId: string) {
  const category = await findCategory(id);
  if (!category.iconFileId) return;
  const fileId = category.iconFileId;
  const orphan = await prisma.$transaction(async (tx) => {
    await tx.category.update({ where: { id: category.id }, data: { iconFileId: null } });
    const key = await deleteFileIfUnused(tx, fileId);
    await tx.auditLog.create({ data: { userId, action: "category.icon.remove", entity: "Category", entityId: category.id } });
    return key;
  }, TX);
  await deleteStoredKeys([orphan]);
}
