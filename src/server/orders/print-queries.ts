import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rawId } from "@/lib/schemas";
import { productName } from "@/server/inventory/queries";
import { BULK_MAX } from "./bulk";
import { buildPickList, type PickOrder } from "./pick-list";

/** `?ids=a,b,c` của trang in hàng loạt → danh sách id hợp lệ (bỏ trùng, tối đa BULK_MAX). Sai → null. */
export function parsePrintIds(raw: string | string[] | undefined): string[] | null {
  const list = (Array.isArray(raw) ? raw.join(",") : (raw ?? "")).split(",").map((s) => s.trim()).filter(Boolean);
  const parsed = z.array(rawId).min(1).max(BULK_MAX).safeParse([...new Set(list)]);
  return parsed.success ? parsed.data : null;
}

/** Đơn để in nhãn, giữ đúng thứ tự đã chọn. */
export async function ordersForLabels(ids: string[]) {
  const orders = await prisma.order.findMany({
    where: { id: { in: ids } },
    include: { items: { select: { qty: true } }, deliveries: { orderBy: { createdAt: "desc" }, take: 1, select: { trackingNo: true } } },
  });
  const byId = new Map(orders.map((o) => [o.id, o]));
  return ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
}
export type LabelOrder = Awaited<ReturnType<typeof ordersForLabels>>[number];

/** Phiếu lấy hàng gộp: theo kho của SP, combo bung thành phần, kèm danh sách đơn để đóng gói. */
export async function pickListFor(ids: string[]) {
  const orders = await prisma.order.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      code: true,
      status: true,
      recipientName: true,
      items: {
        select: {
          variantId: true,
          sku: true,
          name: true,
          qty: true,
          variant: {
            select: {
              isBundle: true,
              product: { select: { stockLocation: { select: { id: true, name: true } } } },
              bundleItems: {
                select: {
                  qty: true,
                  component: { select: { id: true, sku: true, label: true, product: { select: { slug: true, translations: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });
  const byId = new Map(orders.map((o) => [o.id, o]));
  const ordered = ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  const pickOrders: PickOrder[] = ordered.map((o) => ({
    id: o.id,
    code: o.code,
    items: o.items.map((i) => ({
      variantId: i.variantId,
      sku: i.sku,
      name: i.name,
      qty: i.qty,
      location: i.variant.product.stockLocation,
      components: i.variant.isBundle
        ? i.variant.bundleItems.map((b) => ({
            variantId: b.component.id,
            sku: b.component.sku,
            name: `${productName(b.component.product.translations, b.component.product.slug)} — ${b.component.label}`,
            qty: b.qty,
          }))
        : undefined,
    })),
  }));
  return { orders: ordered, groups: buildPickList(pickOrders) };
}
