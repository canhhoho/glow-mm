import "server-only";
import { z } from "zod";
import { rawId } from "@/lib/schemas";
import { prisma } from "@/lib/db";
import type { Tx } from "@/server/inventory/ledger";
import { approvalHash, type ApprovalSnapshot } from "./approval-rules";
import { loadReadiness } from "./readiness";
import { CatalogError } from "./products";

/**
 * QT2 — bước 4 Duyệt (docs/ke-hoach-quy-trinh-san-pham.md). Duyệt lưu người + thời điểm + dấu vân tay
 * (`approvalHash`); mọi đường sửa nội dung/giá/ảnh chạy qua `guardApproval` → đổi dấu vân tay thì huỷ duyệt.
 */

export async function approvalHashes(db: Tx, productIds: string[]): Promise<Map<string, string>> {
  if (productIds.length === 0) return new Map();
  const rows = await db.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      categoryId: true,
      brandId: true,
      translations: { select: { locale: true, name: true, description: true } },
      variants: { select: { sku: true, label: true, priceMmk: true, active: true, weightGrams: true } },
      images: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { fileId: true } },
    },
  });
  return new Map(
    rows.map((p) => {
      const snapshot: ApprovalSnapshot = { categoryId: p.categoryId, brandId: p.brandId, content: p.translations, variants: p.variants, images: p.images.map((i) => i.fileId) };
      return [p.id, approvalHash(snapshot)];
    }),
  );
}

/**
 * Chạy `fn` (trong transaction `tx`); SP đã duyệt mà dấu vân tay trước/sau khác nhau → huỷ duyệt (giữ `approvedHash`
 * để hiện "cần duyệt lại"), audit `product.approval_reset`. So trước/sau nên SP được duyệt lúc chuyển đổi (chưa có hash) vẫn đúng.
 */
export async function guardApproval<T>(tx: Tx, productIds: string[], userId: string, fn: () => Promise<T>): Promise<T> {
  const ids = [...new Set(productIds.filter(Boolean))];
  const approved = ids.length
    ? await tx.product.findMany({ where: { id: { in: ids }, approvedAt: { not: null } }, select: { id: true, approvedHash: true } })
    : [];
  if (approved.length === 0) return fn();
  const before = await approvalHashes(tx, approved.map((p) => p.id));
  const result = await fn();
  const after = await approvalHashes(tx, approved.map((p) => p.id));
  for (const p of approved) {
    if (before.get(p.id) === after.get(p.id)) continue;
    await tx.product.update({ where: { id: p.id }, data: { approvedAt: null, approvedById: null, approvedHash: p.approvedHash ?? before.get(p.id) } });
    await tx.auditLog.create({ data: { userId, action: "product.approval_reset", entity: "Product", entityId: p.id } });
  }
  return result;
}

const approveSchema = z.object({ id: rawId });

/** Duyệt: chỉ khi checklist mở bán không còn lỗi nào ngoài "chưa duyệt". */
export async function approveProduct(raw: unknown, userId: string, now = new Date()) {
  const { id } = approveSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${id} FOR UPDATE`;
    const product = await tx.product.findUnique({ where: { id }, select: { id: true, archivedAt: true, approvedAt: true } });
    if (!product) throw new CatalogError("Không tìm thấy sản phẩm");
    if (product.archivedAt) throw new CatalogError("Sản phẩm đã ngừng kinh doanh");
    if (product.approvedAt) throw new CatalogError("Sản phẩm đã được duyệt");
    const readiness = (await loadReadiness(tx, [id]))!.get(id)!;
    const blocking = readiness.errors.filter((e) => e.code !== "NOT_APPROVED");
    if (blocking.length) throw new CatalogError("Còn lỗi mở bán — xử lý các bước trước rồi duyệt");
    const hash = (await approvalHashes(tx, [id])).get(id)!;
    await tx.product.update({ where: { id }, data: { approvedAt: now, approvedById: userId, approvedHash: hash } });
    await tx.auditLog.create({ data: { userId, action: "product.approve", entity: "Product", entityId: id, data: { hash } } });
    return { id };
  });
}

/** Dashboard (QT2): SP chờ duyệt (đã xong bước 1–3, chưa từng duyệt) và SP cần duyệt lại (sửa sau khi duyệt). */
export async function approvalCounts() {
  const [candidates, reapprove] = await Promise.all([
    prisma.product.findMany({ where: { archivedAt: null, approvedAt: null, approvedHash: null }, select: { id: true } }),
    prisma.product.count({ where: { archivedAt: null, approvedAt: null, approvedHash: { not: null } } }),
  ]);
  const readiness = await loadReadiness(prisma, candidates.map((p) => p.id));
  const toApprove = candidates.filter((p) => readiness.get(p.id)?.errors.every((e) => e.code === "NOT_APPROVED")).length;
  return { toApprove, reapprove };
}
