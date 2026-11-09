import "server-only";
import { prisma } from "@/lib/db";
import { salesBlockDays } from "@/server/inventory/documents";
import { availableToSell } from "@/server/orders/availability";

/** Đếm SP, không đếm SKU/cái; tồn đọc mới và dùng chung quy tắc bán hàng (kể cả combo). */
export async function listBrandsAdmin(query = "", now = new Date()) {
  const q = query.trim();
  const brands = await prisma.brand.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : {},
    orderBy: { name: "asc" },
    select: {
      id: true, name: true,
      // Tổng liên kết vẫn dùng để chặn xoá, kể cả SP ngừng kinh doanh.
      _count: { select: { products: true } },
      products: {
        where: { archivedAt: null },
        select: {
          stockLocation: { select: { active: true, sellable: true } },
          variants: { where: { active: true }, select: { id: true } },
        },
      },
    },
    take: 200,
  });
  const ids = brands.flatMap((b) => b.products.filter((p) => p.stockLocation.active && p.stockLocation.sellable).flatMap((p) => p.variants.map((v) => v.id)));
  const available = ids.length
    ? await availableToSell(prisma, ids, { now, blockDays: await salesBlockDays() })
    : new Map<string, number>();
  return brands.map((b) => ({
    id: b.id, name: b.name,
    totalProducts: b._count.products,
    managedProducts: b.products.length,
    inStockProducts: b.products.filter((p) => p.stockLocation.active && p.stockLocation.sellable && p.variants.some((v) => (available.get(v.id) ?? 0) > 0)).length,
  }));
}
