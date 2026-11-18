import "server-only";
import { prisma } from "@/lib/db";
import { loadReadiness } from "@/server/catalog/readiness";

/**
 * Biến thể cần tính lại giá vì có tỷ giá mới hơn lần đổi giá gần nhất (kho hàng nhập VN) — 18/11/2026, nút
 * "Tính lại theo tỷ giá mới" ở trang Giá bán. Cùng quy tắc với cảnh báo `RATE_NEWER` (`catalog/readiness.ts`):
 * đọc thẳng cảnh báo đó, không viết điều kiện thứ hai. Tối đa `limit` SKU (trang thủ công nhận ≤ 200).
 */
export async function rateRecalcVariantIds(limit = 200): Promise<string[]> {
  const products = await prisma.product.findMany({
    where: { archivedAt: null, stockLocation: { pricingMode: "VN_IMPORT" } },
    select: { id: true },
  });
  if (products.length === 0) return [];
  const readiness = await loadReadiness(prisma, products.map((p) => p.id));
  const skus = [...readiness.values()].flatMap((r) => r.warnings.filter((w) => w.code === "RATE_NEWER").flatMap((w) => w.skus ?? []));
  if (skus.length === 0) return [];
  const variants = await prisma.variant.findMany({ where: { sku: { in: skus } }, orderBy: { sku: "asc" }, select: { id: true }, take: limit });
  return variants.map((v) => v.id);
}
