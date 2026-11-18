import "server-only";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import type { OrderError } from "./errors";

/**
 * Câu báo lỗi đơn hàng (chuỗi `Orders.err.*`) kèm chi tiết để người lên đơn sửa được: SKU thiếu hàng (còn/cần),
 * SKU chưa có giá / ngừng bán, lô thiếu giá vốn. Dùng chung cho admin (`orders/actions.ts`) và cổng CTV
 * (`affiliates/portal-actions.ts`) — 18/11/2026: CTV trước chỉ thấy "Không đủ hàng" không rõ SKU.
 */
export async function orderErrorText(e: OrderError): Promise<string> {
  const t = await getTranslations("Orders");
  const skuOf = async (ids: string[]) =>
    new Map((await prisma.variant.findMany({ where: { id: { in: ids } }, select: { id: true, sku: true } })).map((s) => [s.id, s.sku]));
  if (e.code === "out_of_stock") {
    const rows = (e.details?.variants as { variantId: string; requested: number; available: number }[]) ?? [];
    const ids = rows.map((r) => r.variantId).concat(e.details?.variantId ? [String(e.details.variantId)] : []);
    const sku = await skuOf(ids);
    const list = rows.length
      ? rows.map((r) => `${sku.get(r.variantId) ?? r.variantId} (${r.available}/${r.requested})`).join(", ")
      : ids.map((id) => sku.get(id) ?? id).join(", ");
    return `${t("err.out_of_stock")}: ${list}`;
  }
  if (e.code === "price_missing" && e.details?.sku) return `${t("err.price_missing")}: ${String(e.details.sku)}`;
  if (e.code === "variant_unavailable" && typeof e.details?.variantId === "string") {
    const sku = (await skuOf([e.details.variantId])).get(e.details.variantId);
    if (sku) return `${t("err.variant_unavailable")}: ${sku}`;
  }
  if (e.code === "cost_missing") {
    const lots = (e.details?.lots as { sku: string; lotNo: string }[]) ?? [];
    return `${t("err.cost_missing")}: ${lots.map((l) => `${l.sku} · ${l.lotNo}`).join(", ")}`;
  }
  return t(`err.${e.code}`);
}
