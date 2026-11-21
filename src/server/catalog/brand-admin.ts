import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { rawId } from "@/lib/schemas";
import { writeAudit } from "@/server/audit";
import { approvalHashes } from "./approval";
import { brandSlug, normalizeBrandName } from "./brands";
import { CatalogError, lockCatalog } from "./products";

/**
 * Quản lý thương hiệu (21/11/2026, audit #14) — trang `/admin/brands` (ADMIN, `catalog:manage`).
 * Thương hiệu vẫn được TẠO khi gõ tên ở form SP / Excel (`findOrCreateBrand`) và tự xoá khi hết SP (`pruneEmptyBrands`);
 * ở đây chỉ thêm: xem danh sách + số SP, ĐỔI TÊN (sửa chính tả) và GỘP thương hiệu gõ trùng/sai vào một thương hiệu.
 * Gộp = sửa dữ liệu gốc (người dùng chốt 21/11/2026): chuyển mọi SP (kể cả đã duyệt / đang đăng) sang thương hiệu đích
 * ngay, KHÔNG bắt duyệt lại — cập nhật `approvedHash` của SP đã duyệt và `brandId` trong bản đang sửa chờ duyệt.
 */

export async function listBrandsAdmin(q = "") {
  const query = q.trim();
  const brands = await prisma.brand.findMany({
    where: query ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { slug: { contains: query.toLowerCase() } }] } : undefined,
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, _count: { select: { products: true } } },
  });
  const ids = brands.map((b) => b.id);
  const [active, published] = await Promise.all([
    prisma.product.groupBy({ by: ["brandId"], where: { brandId: { in: ids }, archivedAt: null }, _count: { _all: true } }),
    prisma.product.groupBy({ by: ["brandId"], where: { brandId: { in: ids }, archivedAt: null, published: true }, _count: { _all: true } }),
  ]);
  const activeOf = new Map(active.map((r) => [r.brandId, r._count._all]));
  const publishedOf = new Map(published.map((r) => [r.brandId, r._count._all]));
  return brands.map((b) => ({
    id: b.id,
    name: b.name,
    slug: b.slug,
    products: b._count.products,
    activeProducts: activeOf.get(b.id) ?? 0,
    publishedProducts: publishedOf.get(b.id) ?? 0,
  }));
}

const renameSchema = z.object({ id: rawId, name: z.string().trim().min(1, "Cần nhập tên thương hiệu").max(80) });

/** Đổi tên (và mã trong đường dẫn lọc của web khách nếu tên mới có chữ Latin). Trùng thương hiệu khác → dùng Gộp. */
export async function renameBrand(raw: unknown, userId: string) {
  const input = renameSchema.parse(raw);
  const name = normalizeBrandName(input.name);
  return prisma.$transaction(async (tx) => {
    await lockCatalog(tx);
    const brand = await tx.brand.findUnique({ where: { id: input.id } });
    if (!brand) throw new CatalogError("Thương hiệu không còn tồn tại");
    if (brand.name === name) return brand;
    const slug = brandSlug(name) || brand.slug;
    const clash = await tx.brand.findFirst({
      where: { id: { not: brand.id }, OR: [{ name: { equals: name, mode: "insensitive" } }, { slug }] },
      select: { name: true },
    });
    if (clash) throw new CatalogError(`Đã có thương hiệu "${clash.name}" — dùng "Gộp vào" để gộp hai thương hiệu`);
    const updated = await tx.brand.update({ where: { id: brand.id }, data: { name, slug } });
    await writeAudit(tx, { userId, action: "brand.rename", entity: "Brand", entityId: brand.id, data: { from: brand.name, to: name, slugFrom: brand.slug, slugTo: slug } });
    return updated;
  });
}

const mergeSchema = z.object({ fromId: rawId, toId: rawId }).refine((d) => d.fromId !== d.toId, { message: "Chọn thương hiệu đích khác thương hiệu đang gộp", path: ["toId"] });

/** Gộp `fromId` vào `toId`: chuyển mọi SP, sửa bản đang sửa chờ duyệt, xoá thương hiệu cũ. Trả số SP đã chuyển. */
export async function mergeBrands(raw: unknown, userId: string): Promise<{ moved: number; from: string; to: string }> {
  const { fromId, toId } = mergeSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    await lockCatalog(tx);
    const [from, to] = await Promise.all([tx.brand.findUnique({ where: { id: fromId } }), tx.brand.findUnique({ where: { id: toId } })]);
    if (!from || !to) throw new CatalogError("Thương hiệu không còn tồn tại");
    const products = await tx.product.findMany({ where: { brandId: fromId }, select: { id: true, approvedAt: true, approvedHash: true } });
    const approved = products.filter((p) => p.approvedAt);
    const before = await approvalHashes(tx, approved.map((p) => p.id));
    await tx.product.updateMany({ where: { brandId: fromId }, data: { brandId: toId } });
    // SP đã duyệt: dấu vân tay duyệt gồm thương hiệu → ghi lại dấu mới (gộp không bắt duyệt lại).
    const after = await approvalHashes(tx, approved.map((p) => p.id));
    for (const p of approved) {
      if (p.approvedHash && p.approvedHash === before.get(p.id)) await tx.product.update({ where: { id: p.id }, data: { approvedHash: after.get(p.id) } });
    }
    // Bản đang sửa chờ duyệt còn trỏ thương hiệu cũ → trỏ sang thương hiệu đích (áp bản duyệt không lỗi khoá ngoại).
    const pending = await tx.productChangeRequest.findMany({ where: { content: { path: ["brandId"], equals: fromId } }, select: { productId: true, content: true } });
    for (const r of pending) {
      const content: Prisma.JsonObject = { ...(r.content as Prisma.JsonObject), brandId: toId };
      delete content.brandName;
      await tx.productChangeRequest.update({ where: { productId: r.productId }, data: { content } });
    }
    await tx.brand.delete({ where: { id: fromId } });
    await writeAudit(tx, { userId, action: "brand.merge", entity: "Brand", entityId: toId, data: { from: from.name, fromId, to: to.name, products: products.length, approved: approved.length, pendingChanges: pending.length } });
    return { moved: products.length, from: from.name, to: to.name };
  });
}
