import "server-only";
import type { Tx } from "@/server/inventory/ledger";
import { z } from "zod";
import { rawId } from "@/lib/schemas";
import { prisma } from "@/lib/db";
import { deleteFileIfUnused, deleteStoredKeys } from "@/server/files/public-images";
import { assertStockLocation } from "@/server/inventory/warehouses";
import { assertBundleWarehouses, CatalogError } from "./products";
import { pruneEmptyBrands } from "./brands";

/**
 * Xoá sản phẩm khỏi danh mục admin.
 * - Chưa nhập kho / chưa có lịch sử (lô đã ghi sổ, phiếu đã ghi sổ, giữ hàng, đơn, không là thành phần combo SP khác)
 *   → xoá hẳn (kèm biến thể, ảnh, lịch sử giá).
 *   Phiếu NHÁP hoặc ĐÃ HUỶ không tính là lịch sử (chưa từng vào sổ kho): dòng của chúng + lô chưa dùng bị xoá theo,
 *   phiếu nháp/huỷ không còn dòng nào cũng xoá → SP chưa nhập kho xoá hẳn được.
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
    // Chỉ phiếu ĐÃ GHI SỔ mới là lịch sử; phiếu nháp / đã huỷ = chưa nhập kho → vẫn xoá hẳn được.
    const posted = { document: { status: "POSTED" as const } };
    // Lô có sổ kho / tồn / dòng phiếu đã ghi sổ / phân bổ đơn / phiếu soạn = lịch sử thật.
    mark(
      await tx.batch.findMany({
        where: {
          ...where,
          OR: [{ ledger: { some: {} } }, { balances: { some: {} } }, { documentLines: { some: posted } }, { allocations: { some: {} } }, { pickLines: { some: {} } }],
        },
        select: { variantId: true },
        distinct: ["variantId"],
      }),
    );
    mark(await tx.stockDocumentLine.findMany({ where: { ...where, ...posted }, select: { variantId: true }, distinct: ["variantId"] }));
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
      const brandIds = (await tx.product.findMany({ where: { id: { in: toDelete } }, select: { brandId: true } })).map((p) => p.brandId);
      const delVariants = variants.filter((v) => toDelete.includes(v.productId)).map((v) => v.id);
      const images = await tx.productImage.findMany({ where: { productId: { in: toDelete } }, select: { fileId: true } });
      await tx.bundleItem.deleteMany({ where: { OR: [{ bundleId: { in: delVariants } }, { componentId: { in: delVariants } }] } });
      await tx.priceHistory.deleteMany({ where: { variantId: { in: delVariants } } });
      await tx.priceRunLine.deleteMany({ where: { variantId: { in: delVariants } } });
      // Phiếu nháp / đã huỷ (chưa ghi sổ): xoá dòng của các biến thể này, lô chưa dùng, rồi phiếu không còn dòng nào.
      const unpostedDocs = await tx.stockDocumentLine.findMany({ where: { variantId: { in: delVariants } }, select: { documentId: true }, distinct: ["documentId"] });
      const unposted = { status: { in: ["DRAFT" as const, "CANCELLED" as const] } };
      await tx.stockDocumentLine.deleteMany({ where: { variantId: { in: delVariants }, document: unposted } });
      await tx.batch.deleteMany({ where: { variantId: { in: delVariants } } });
      await tx.stockDocument.deleteMany({
        where: { id: { in: unpostedDocs.map((d) => d.documentId) }, ...unposted, lines: { none: {} }, ledger: { none: {} }, priceRunLines: { none: {} } },
      });
      await tx.variant.deleteMany({ where: { id: { in: delVariants } } });
      // Bản dịch, tag, ảnh, đánh giá, mục bộ sưu tập xoá theo cascade.
      await tx.product.deleteMany({ where: { id: { in: toDelete } } });
      await pruneEmptyBrands(tx, brandIds, userId); // thương hiệu không còn SP nào → xoá theo
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

/**
 * Đổi kho bán cho nhiều SP (P24). Hàng còn ở kho cũ chỉ bán lại sau khi tạo phiếu chuyển sang kho mới.
 * Combo và thành phần phải cùng kho → kiểm tra sau khi đổi, sai thì huỷ cả lần đổi.
 */
export async function moveProductsToWarehouse(rawIds: unknown, rawLocationId: unknown, userId: string): Promise<number> {
  const ids = [...new Set(idsSchema.parse(rawIds))];
  const locationId = rawId.parse(rawLocationId);
  return prisma.$transaction((tx) => moveProductsToWarehouseTx(tx, ids, locationId, userId));
}

/** Cùng thao tác trong transaction có sẵn (nhập Excel gán kho từ cột Kho bán khi xác nhận — 19/11/2026). */
export async function moveProductsToWarehouseTx(tx: Tx, ids: string[], locationId: string, userId: string): Promise<number> {
    const loc = await assertStockLocation(tx, locationId).catch((e: Error) => {
      throw new CatalogError(e.message);
    });
    // SP chưa có kho (chưa nhập hàng) cũng gán được kho trước bằng thao tác này.
    const rows = await tx.product.findMany({ where: { id: { in: ids }, OR: [{ stockLocationId: null }, { stockLocationId: { not: loc.id } }] }, select: { id: true } });
    if (rows.length === 0) return 0;
    const moved = rows.map((r) => r.id);
    await tx.product.updateMany({ where: { id: { in: moved } }, data: { stockLocationId: loc.id } });
    await assertBundleWarehouses(tx, moved);
    await tx.auditLog.createMany({
      data: moved.map((entityId) => ({ userId, action: "product.move", entity: "Product", entityId, data: { locationId: loc.id } })),
    });
    return moved.length;
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
