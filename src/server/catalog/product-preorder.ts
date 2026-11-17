import "server-only";
import { z } from "zod";
import { rawId } from "@/lib/schemas";
import { prisma } from "@/lib/db";
import { CatalogError } from "./products";

/**
 * QT3 — bước 5 "Đăng bán": cho / không cho đặt trước khi hết hàng + hạn mức riêng từng biến thể
 * (trống = theo cài đặt `preorder.defaultLimit`). Không thuộc dấu vân tay duyệt (không ảnh hưởng bước 4).
 */
export const productPreorderSchema = z.object({
  productId: rawId,
  enabled: z.boolean(),
  limits: z
    .array(z.object({ id: rawId, limit: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(0).max(100_000).nullable()) }))
    .max(200)
    .default([]),
});

export async function saveProductPreorder(raw: unknown, userId: string) {
  const input = productPreorderSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id: input.productId }, select: { id: true, preorderEnabled: true, variants: { select: { id: true, sku: true, preorderLimit: true } } } });
    if (!product) throw new CatalogError("Không tìm thấy sản phẩm");
    const current = new Map(product.variants.map((v) => [v.id, v]));
    const changes: { sku: string; from: number | null; to: number | null }[] = [];
    for (const l of input.limits) {
      const v = current.get(l.id);
      if (!v) throw new CatalogError("Phân loại không thuộc sản phẩm này");
      if (v.preorderLimit === l.limit) continue;
      await tx.variant.update({ where: { id: v.id }, data: { preorderLimit: l.limit } });
      changes.push({ sku: v.sku, from: v.preorderLimit, to: l.limit });
    }
    const toggled = product.preorderEnabled !== input.enabled;
    if (toggled) await tx.product.update({ where: { id: product.id }, data: { preorderEnabled: input.enabled } });
    if (toggled || changes.length) {
      await tx.auditLog.create({
        data: { userId, action: "product.preorder", entity: "Product", entityId: product.id, data: { enabled: input.enabled, limits: changes } },
      });
    }
    return { changed: changes.length + (toggled ? 1 : 0) };
  });
}
