import { redirect } from "next/navigation";
import { requirePagePermission } from "@/server/auth/session";
import { focusQuery, parsePriceFocus } from "@/lib/price-focus";

/** Route cũ (21/11/2026, audit #21): đặt giá nay nằm ở `/admin/selling-prices?ids=… | productId=… | scope=rate`. Giữ để link cũ vẫn mở được. */
export default async function ManualPricesPage({ searchParams }: PageProps<"/admin/selling-prices/manual">) {
  await requirePagePermission("pricing:manage");
  const focus = parsePriceFocus(await searchParams);
  redirect(focus ? `/admin/selling-prices?${focusQuery(focus)}` : "/admin/selling-prices");
}
