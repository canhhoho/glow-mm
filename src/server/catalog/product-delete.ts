import "server-only";
import { z } from "zod";
import { rawId } from "@/lib/schemas";
import { prisma } from "@/lib/db";
import { deleteFileIfUnused, deleteStoredKeys } from "@/server/files/public-images";

/**
 * Xoá sản phẩm khỏi danh mục admin.
 * - Chưa có lịch sử (lô, phiếu kho, giữ hàng, đơn, không là thành phần combo SP khác) → xoá hẳn (kèm biến thể, ảnh, lịch sử giá).
 * - Đã có lịch sử → NGỪNG KINH DOANH (`archivedAt`, ẩn khỏi web): sổ kho/đơn ghi thêm, không xoá được.
 */

const TX = { maxWait: 10_000, timeout: 60_000 };
const idsSchema = z.array(rawId).min(1, "Chưa chọn sản phẩm nào").max(500);

export type DeleteResult = { deleted: number; archived: number };

export async function deleteProducts(rawIds: unknown, userId: string): Promise<DeleteResult> {
  const ids = [...new Set(idsSchema.parse(rawIds))];
  const { result, orphanKeys } = await prisma.$transaction(async (tx) => {
    // Khoá theo thứ tự id để hai thao tác song song không deadlock; chặn sửa/thêm ảnh cùng lúc.
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Product" WHERE "id" = ANY(${ids}) ORDER BY "id" FOR UPDATE`;
    const productIds = locked.map((p) => p.id);
    const variants = await tx.variant.findMany({ where: { productId: { in: productIds } }, select: { id: true, productId: true } });
    const variantIds = variants.map((v) => v.id);
    const productOf = new Map(variants.map((v) => [v.id, v.productId]));

    // SP có lịch sử = biến thể nào đó đã xuất hiện ở lô / dòng phiếu / giữ hàng / dòng đơn, hoặc là thành phần combo của SP khác.
    const used = new Set<string>();
    const mark = (rows: { variantId: string }[]) => rows.forEach((r) => used.add(productOf.get(r.variantId)!));
    const where = { variantId: { in: variantIds } };
    mark(await tx.batch.findMany({ where, select: { variantId: true }, distinct: ["variantId"] }));
    mark(await tx.stockDocumentLine.findMany({ where, select: { variantId: true }, distinct: ["variantId"] }));
    mark(await tx.reservation.findMany({ where, select: { variantId: true }, distinct: ["variantId"] }));
    mark(await tx.orderItem.findMany({ where, select: { variantId: true }, distinct: ["variantId"] }));
    const componentOf = await tx.bundleItem.findMany({
      where: { componentId: { in: variantIds } },
      select: { componentId: true, bundle: { select: { productId: true } } },
    });
    for (const b of componentOf) {
      const owner = productOf.get(b.componentId)!;
      if (b.bundle.productId !== owner) used.add(owner);
    }

    const toArchive = productIds.filter((id) => used.has(id));
    const toDelete = productIds.filter((id) => !used.has(id));
    const now = new Date();

    if (toArchive.length) {
      await tx.product.updateMany({ where: { id: { in: toArchive } }, data: { archivedAt: now, published: false } });
    }

    const keys: (string | null)[] = [];
    if (toDelete.length) {
      const delVariants = variants.filter((v) => toDelete.includes(v.productId)).map((v) => v.id);
      const images = await tx.productImage.findMany({ where: { productId: { in: toDelete } }, select: { fileId: true } });
      await tx.bundleItem.deleteMany({ where: { OR: [{ bundleId: { in: delVariants } }, { componentId: { in: delVariants } }] } });
      await tx.priceHistory.deleteMany({ where: { variantId: { in: delVariants } } });
      await tx.priceRunLine.deleteMany({ where: { variantId: { in: delVariants } } });
      await tx.variant.deleteMany({ where: { id: { in: delVariants } } });
      // Bản dịch, tag, ảnh, đánh giá, mục bộ sưu tập xoá theo cascade.
      await tx.product.deleteMany({ where: { id: { in: toDelete } } });
      for (const fileId of new Set(images.map((i) => i.fileId))) keys.push(await deleteFileIfUnused(tx, fileId));
    }

    await tx.auditLog.createMany({
      data: [
        ...toDelete.map((entityId) => ({ userId, action: "product.delete", entity: "Product", entityId })),
        ...toArchive.map((entityId) => ({ userId, action: "product.archive", entity: "Product", entityId })),
      ],
    });
    return { result: { deleted: toDelete.length, archived: toArchive.length }, orphanKeys: keys };
  }, TX);
  await deleteStoredKeys(orphanKeys);
  return result;
}

/** Khôi phục SP ngừng kinh doanh về danh mục (vẫn ẩn — bật hiển thị riêng). */
export async function restoreProducts(rawIds: unknown, userId: string): Promise<number> {
  const ids = [...new Set(idsSchema.parse(rawIds))];
  return prisma.$transaction(async (tx) => {
    const rows = await tx.product.findMany({ where: { id: { in: ids }, archivedAt: { not: null } }, select: { id: true } });
    if (rows.length === 0) return 0;
    await tx.product.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { archivedAt: null } });
    await tx.auditLog.createMany({ data: rows.map((r) => ({ userId, action: "product.restore", entity: "Product", entityId: r.id })) });
    return rows.length;
  });
}
